const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { promisify } = require('util');
const gzip = promisify(zlib.gzip);
const {getPersistedLogsDirectory} = require('./helpers')

async function saveToPersistentStorage(logsByDate, userConfig = null){
    const baseDir = getPersistedLogsDirectory(userConfig);
    const stats = {};
    
    for (const [dateKey, logs] of Object.entries(logsByDate)) {
        const dateDir = path.join(baseDir, dateKey);
        stats[dateKey] = {};
        
        // Create date directory if it doesn't exist
        if (!fs.existsSync(dateDir)) {
            fs.mkdirSync(dateDir, { recursive: true });
        }
        
        // Use daily files instead of timestamped files
        for (const logFile of logs) {
            const dailyFilePath = path.join(dateDir, logFile.name);
            const timestamp = new Date().toISOString();
            
            // Create content hash to detect duplicates
            const contentHash = crypto.createHash('md5').update(logFile.content).digest('hex');
            const hashFile = `${dailyFilePath}.hashes`;
            
            // Check if we've seen this exact content before
            let existingHashes = [];
            if (fs.existsSync(hashFile)) {
                try {
                    existingHashes = fs.readFileSync(hashFile, 'utf8').split('\n').filter(h => h.length > 0);
                } catch (error) {
                    // Ignore hash file errors
                }
            }
            
            if (existingHashes.includes(contentHash)) {
                // Skip duplicate content
                stats[dateKey][logFile.name] = 0; // No new lines added
                continue;
            }
            
            const logEntry = `\n=== ${timestamp} ===\n${logFile.content}\n`;
            
            // Count lines in the new content
            const newLines = logFile.content.split('\n').length;
            stats[dateKey][logFile.name] = newLines;
            
            // Append to daily file instead of creating new files
            fs.appendFileSync(dailyFilePath, logEntry, 'utf8');
            
            // Store content hash to prevent future duplicates
            fs.appendFileSync(hashFile, `${contentHash}\n`, 'utf8');
        }
    }
    
    return stats;
}

async function createDailyArchives(dates, userConfig = null) {
    const baseDir = getPersistedLogsDirectory(userConfig);
    
    for (const dateKey of dates) {
        const dateDir = path.join(baseDir, dateKey);
        const archivePath = path.join(baseDir, `${dateKey}_copilot_logs.tar.gz`);
        
        if (fs.existsSync(dateDir)) {
            try {
                // Create tar.gz archive for this date
                const tarData = await createTarArchiveFromDirectory(dateDir, dateKey);
                const compressedData = await gzip(tarData);
                fs.writeFileSync(archivePath, compressedData);
            } catch (error) {
                console.warn(`Failed to create archive for ${dateKey}:`, error);
            }
        }
    }
}


async function createTarArchiveFromDirectory(directory, datePrefix){
    const chunks = [];
    const files = fs.readdirSync(directory);
    
    for (const fileName of files) {
        const filePath = path.join(directory, fileName);
        const stat = fs.statSync(filePath);
        
        if (stat.isFile()) {
            const content = fs.readFileSync(filePath);
            const tarPath = `${datePrefix}/${fileName}`;
            const header = createTarHeader(tarPath, content.length, '0');
            
            chunks.push(header);
            chunks.push(content);
            
            // Padding
            const remainder = content.length % 512;
            if (remainder !== 0) {
                const padding = 512 - remainder;
                chunks.push(Buffer.alloc(padding, 0));
            }
        }
    }
    
    // End of archive
    chunks.push(Buffer.alloc(512, 0));
    chunks.push(Buffer.alloc(512, 0));
    
    return Buffer.concat(chunks);
}

function createTarHeader(name, size, typeFlag) {
    const header = Buffer.alloc(512, 0);
    
    // Name (100 bytes)
    const nameBytes = Buffer.from(name.substring(0, 100), 'ascii');
    nameBytes.copy(header, 0);
    
    // Mode (8 bytes) 
    header.write(typeFlag === '5' ? '0000755\0' : '0000644\0', 100, 'ascii');
    
    // UID (8 bytes)
    header.write('0000000\0', 108, 'ascii');
    
    // GID (8 bytes) 
    header.write('0000000\0', 116, 'ascii');
    
    // Size (12 bytes) - octal, 11 chars + null terminator
    const sizeOctal = size.toString(8).padStart(11, '0') + '\0';
    header.write(sizeOctal, 124, 'ascii');
    
    // Mtime (12 bytes) - octal, 11 chars + null terminator
    const mtime = Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0';
    header.write(mtime, 136, 'ascii');
    
    // Checksum (8 bytes) - will be calculated and filled below
    header.write('        ', 148, 'ascii'); // 8 spaces initially
    
    // Type flag (1 byte)
    header.write(typeFlag, 156, 'ascii');
    
    // Magic (6 bytes) - "ustar\0"
    header.write('ustar\0', 257, 'ascii');
    
    // Version (2 bytes) - "00"
    header.write('00', 263, 'ascii');
    
    // Calculate checksum
    let checksum = 0;
    for (let i = 0; i < 512; i++) {
        checksum += header[i];
    }
    
    // Write checksum as 6-digit octal + null + space
    const checksumStr = checksum.toString(8).padStart(6, '0') + '\0 ';
    header.write(checksumStr, 148, 'ascii');
    
    return header;
}

/**
 * Save parsed metrics to JSON files organized by date
 */
async function saveMetricsToJSON(aggregatedMetrics, userConfig = null) {
    const baseDir = getPersistedLogsDirectory(userConfig);
    const metricsDir = path.join(baseDir, 'metrics');

    // Create metrics directory if it doesn't exist
    if (!fs.existsSync(metricsDir)) {
        fs.mkdirSync(metricsDir, { recursive: true });
    }

    // Group metrics by date
    const metricsByDate = {};
    for (const [key, value] of Object.entries(aggregatedMetrics)) {
        const date = value.date;
        if (!metricsByDate[date]) {
            metricsByDate[date] = [];
        }
        metricsByDate[date].push(value);
    }

    // Save each date's metrics to a separate JSON file
    const savedFiles = [];
    for (const [date, metrics] of Object.entries(metricsByDate)) {
        const filename = `metrics_${date}.json`;
        const filepath = path.join(metricsDir, filename);

        // Load existing metrics if file exists
        let existingMetrics = [];
        if (fs.existsSync(filepath)) {
            try {
                const content = fs.readFileSync(filepath, 'utf8');
                existingMetrics = JSON.parse(content);
            } catch (error) {
                console.warn(`Error reading existing metrics file ${filename}: ${error.message}`);
            }
        }

        // Merge new metrics with existing ones (avoid duplicates by key)
        const mergedMetrics = {};
        for (const metric of [...existingMetrics, ...metrics]) {
            const key = `${metric.source}|${metric.servedBy}|${metric.action}`;
            mergedMetrics[key] = metric;
        }

        // Save merged metrics
        const metricsArray = Object.values(mergedMetrics);
        fs.writeFileSync(filepath, JSON.stringify(metricsArray, null, 2), 'utf8');
        savedFiles.push(filepath);
    }

    return savedFiles;
}

module.exports = {
    saveToPersistentStorage,
    createDailyArchives,
    getPersistedLogsDirectory,
    saveMetricsToJSON
}