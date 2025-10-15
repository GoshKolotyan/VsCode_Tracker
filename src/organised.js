const fs = require('fs');
const path = require('path');

async function organizeLogsByDate(logFiles, collectionState = null){
    const logsByDate = {};

    for (const filePath of logFiles) {
        try {
            const fileName = path.basename(filePath);
            const stat = fs.statSync(filePath);
            
            // Read only new content since last collection
            let content;
            if (collectionState && collectionState.fileSizes && collectionState.fileSizes[filePath]) {
                const lastSize = collectionState.fileSizes[filePath];
                const currentSize = stat.size;
                
                if (currentSize > lastSize) {
                    // Read only the new content from the last known position
                    const buffer = Buffer.alloc(currentSize - lastSize);
                    const fd = fs.openSync(filePath, 'r');
                    fs.readSync(fd, buffer, 0, currentSize - lastSize, lastSize);
                    fs.closeSync(fd);
                    content = buffer.toString('utf8');
                } else {
                    // No new content, skip this file
                    continue;
                }
            } else {
                // First time processing this file, read all content
                content = fs.readFileSync(filePath, 'utf8');
            }
            
            const fileType = getFileType(fileName);
            
            // Determine which dates to use for this file
            let datesToUse = [];
            
            // For incremental reads (when we have collection state), use current date
            // This prevents old content dates from creating wrong date buckets
            if (collectionState && collectionState.fileSizes && collectionState.fileSizes[filePath]) {
                // This is an incremental read - use today's date
                datesToUse.push(new Date());
            } else {
                // This is a full read - use content-based dates as before
                const sessionDate = extractDateFromPath(filePath);
                const contentDates = extractDatesFromContent(content);
                
                if (sessionDate) {
                    datesToUse.push(sessionDate);
                }
                
                if (contentDates.length > 0) {
                    datesToUse.push(...contentDates);
                }
                
                if (datesToUse.length === 0) {
                    // Fallback to file modification time
                    datesToUse.push(new Date(stat.mtime));
                }
            }
            
            // Remove duplicates and organize by date
            const uniqueDates = [...new Map(datesToUse.map(d => [formatDateKey(d), d])).values()];
            
            for (const date of uniqueDates) {
                const dateKey = formatDateKey(date);
                
                if (!logsByDate[dateKey]) {
                    logsByDate[dateKey] = [];
                }
                
                // For incremental reads, use all content as-is
                // For full reads, try to filter to relevant content
                let fileContent = content;
                const isIncrementalRead = collectionState && collectionState.fileSizes && collectionState.fileSizes[filePath];
                
                if (!isIncrementalRead) {
                    // Only do content filtering for full reads
                    const sessionDate = extractDateFromPath(filePath);
                    const contentDates = extractDatesFromContent(content);
                    const isSessionDate = sessionDate && formatDateKey(sessionDate) === dateKey;
                    
                    if (!isSessionDate && contentDates.length > 0) {
                        // Try to extract content for this specific date
                        const dateContent = extractContentForDate(content, date);
                        if (dateContent.trim().length > 0) {
                            fileContent = dateContent;
                        }
                    }
                }
                
                // Use simple daily filenames instead of timestamped ones
                let logName = fileName;
                
                // Add the log entry
                logsByDate[dateKey].push({
                    path: filePath,
                    name: logName,
                    date: date,
                    content: fileContent,
                    type: fileType
                });
            }
            
        } catch (error) {
            console.warn(`Could not process file ${filePath}: ${error}`);
        }
    }

    return logsByDate;
}

function parseDate(dateString){
    try {
        // Clean the date string
        const cleaned = dateString.trim();
        
        // Try ISO format (YYYY-MM-DD)
        if (cleaned.match(/^\d{4}-\d{2}-\d{2}$/)) {
            return new Date(cleaned + 'T00:00:00.000Z');
        }
        
        // Try ISO datetime format (YYYY-MM-DD HH:MM:SS)
        if (cleaned.match(/^\d{4}-\d{2}-\d{2}[\s\T]\d{2}:\d{2}:\d{2}/)) {
            const dateOnly = cleaned.substring(0, 10);
            return new Date(dateOnly + 'T00:00:00.000Z');
        }
        
        // Try US format (MM/DD/YYYY)
        if (cleaned.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
            const parts = cleaned.split('/');
            return new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
        }
        
        // Try YYYY/MM/DD format
        if (cleaned.match(/^\d{4}\/\d{2}\/\d{2}$/)) {
            const parts = cleaned.split('/');
            return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        }
        
        // Try other formats as fallback
        const parsed = new Date(cleaned);
        return isValidDate(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function extractDatesFromContent(content) {
    const dates = [];
    const lines = content.split('\n');
    // Enhanced regex to catch more timestamp formats including GitHub Copilot's format
    const dateTimeRegex = /(\d{4}-\d{2}-\d{2}[\s\T]\d{2}:\d{2}:\d{2})|(\d{4}-\d{2}-\d{2})|(\d{2}\/\d{2}\/\d{4})|(\d{4}\/\d{2}\/\d{2})/g;
    const seenDates = new Set();

    for (const line of lines) {
        const matches = line.match(dateTimeRegex);
        if (matches) {
            for (const match of matches) {
                try {
                    const date = parseDate(match);
                    if (date && isValidDate(date)) {
                        const dateKey = formatDateKey(date);
                        if (!seenDates.has(dateKey)) {
                            seenDates.add(dateKey);
                            dates.push(date);
                        }
                    }
                } catch {
                    continue;
                }
            }
        }
    }

    return dates;
}

function extractContentForDate(content, targetDate) {
    const lines = content.split('\n');
    const targetDateKey = formatDateKey(targetDate);
    const relevantLines = [];
    
    // More flexible date matching - look for the target date in any timestamp format
    const targetDatePattern = targetDateKey; // YYYY-MM-DD format
    
    for (const line of lines) {
        // Check if line contains the target date in any common format
        if (line.includes(targetDatePattern) || 
            line.includes(targetDate.getFullYear().toString()) ||
            line.match(new RegExp(`${targetDate.getFullYear()}-${(targetDate.getMonth() + 1).toString().padStart(2, '0')}-${targetDate.getDate().toString().padStart(2, '0')}`))) {
            relevantLines.push(line);
        }
    }
    
    // If we found relevant lines, return them; otherwise return the whole content
    return relevantLines.length > 0 ? relevantLines.join('\n') : content;
}


// New function to extract dates from file paths (VS Code session directories)
function extractDateFromPath(filePath){
    try {
        // Look for VS Code session directory pattern: YYYYMMDDTHHMMSS
        const sessionMatch = filePath.match(/(\d{8}T\d{6})/);
        if (sessionMatch) {
            const sessionStr = sessionMatch[1]; // e.g., "20250924T171619"
            const dateStr = sessionStr.substring(0, 8); // "20250924"
            const year = parseInt(dateStr.substring(0, 4));
            const month = parseInt(dateStr.substring(4, 6)) - 1; // Month is 0-indexed
            const day = parseInt(dateStr.substring(6, 8));
            
            const sessionDate = new Date(year, month, day);
            return isValidDate(sessionDate) ? sessionDate : null;
        }
        
        return null;
    } catch {
        return null;
    }
}

function isValidDate(date) {
    return date instanceof Date && !isNaN(date.getTime());
}

function formatDateKey(date) {
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

function formatDateForFilename(date) {
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
}



function getFileType(fileName) {
    if (fileName.toLowerCase().includes('chat')) {
        return 'chat';
    } else if (fileName.toLowerCase().includes('copilot')) {
        return 'copilot';
    }
    return 'other';
}

module.exports = { organizeLogsByDate };