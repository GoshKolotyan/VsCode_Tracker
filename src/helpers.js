const fs = require('fs');
const os = require('os');
const path = require('path');
const vscode = require('vscode');

/**
 * Get all possible VS Code log session directories
 */
function getVSCodeLogDirectories() {
    const platform = os.platform();
    const homeDir = os.homedir();
    const baseDirectories = [];

    switch (platform) {
        case 'win32':
            baseDirectories.push(
                path.join(process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'), 'Code', 'logs'),
                path.join(process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local'), 'Code', 'logs')
            );
            break;
        case 'darwin':
            baseDirectories.push(
                path.join(homeDir, 'Library', 'Application Support', 'Code', 'logs'),
                path.join(homeDir, 'Library', 'Application Support', 'Code - Insiders', 'logs')
            );
            break;
        case 'linux':
            baseDirectories.push(
                path.join(homeDir, '.config', 'Code', 'logs'),
                path.join(homeDir, '.config', 'Code - Insiders', 'logs')
            );
            break;
    }

    const sessionDirectories = [];
    for (const baseDir of baseDirectories) {
        if (fs.existsSync(baseDir)) {
            try {
                const sessions = fs.readdirSync(baseDir);
                for (const session of sessions) {
                    // Match session folder format: YYYYMMDDTHHMMSS
                    if (/^\d{8}T\d{6}$/.test(session)) {
                        sessionDirectories.push(path.join(baseDir, session));
                    }
                }
            } catch (error) {
                console.warn(`Could not read VS Code logs directory ${baseDir}: ${error}`);
            }
        }
    }

    return sessionDirectories;
}

/**
 * Recursively find GitHub Copilot log files in a directory
 */
async function findCopilotLogFiles(directory) {
    const logFiles = [];

    try {
        const items = fs.readdirSync(directory, { withFileTypes: true });

        for (const item of items) {
            const fullPath = path.join(directory, item.name);

            try {
                if (item.isFile()) {
                    // Pattern match for ONLY official GitHub Copilot logs - exclude third-party extensions
                    const isLogFile =
                        /^GitHub Copilot( Chat)?\.log(\.\d+)?$/i.test(item.name) ||
                        /^GitHub Copilot.*\.log\.\d+$/i.test(item.name) ||
                        /^GitHub.*Copilot.*\.old$/i.test(item.name) ||
                        /GitHub.*Copilot.*\d{4}-\d{2}-\d{2}/i.test(item.name);
                    
                    // Explicitly exclude third-party extension logs
                    const isThirdPartyExtension =
                        item.name.toLowerCase().includes('insights') ||
                        item.name.toLowerCase().includes('tracker') ||
                        /^\d+-.*copilot.*\.log$/i.test(item.name) ||
                        item.name.toLowerCase().includes('extension');

                    if (isLogFile && !isThirdPartyExtension) {
                        logFiles.push(fullPath);
                    }
                } else if (item.isDirectory()) {
                    // Recursively search inside subdirectories
                    const subDirFiles = await findCopilotLogFiles(fullPath);
                    logFiles.push(...subDirFiles);
                }
            } catch {
                continue; // skip inaccessible entries
            }
        }
    } catch (error) {
        console.warn(`Could not read directory ${directory}: ${error}`);
    }

    return logFiles;
}


function getPersistedLogsDirectory(userConfig = null) {
    // Check for user-configured custom directory
    const config = vscode.workspace.getConfiguration('avocado-copilot-logger');
    const customDir = config.get('logDirectory');

    let logsDir;
    if (customDir && customDir.trim()) {
        // Use custom directory if specified
        logsDir = path.resolve(customDir.trim());
    } else {
        // Generate directory name from user config
        const homeDir = os.homedir();
        const desktopDir = path.join(homeDir, 'Desktop');
        const dirName = generateDirectoryName(userConfig);
        logsDir = path.join(desktopDir, dirName);
    }

    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }

    return logsDir;
}

/**
 * Generate directory name from user config
 * Format: user_name_company_team-vs_code_logg_collector
 */
function generateDirectoryName(userConfig) {
    const sanitize = (str) => {
        if (!str || typeof str !== 'string') return 'Unknown';
        // Replace spaces and special characters with underscores
        return str.trim().replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_');
    };

    const userName = userConfig?.userName ? sanitize(userConfig.userName) : 'Unknown';
    const companyName = userConfig?.company ? sanitize(userConfig.company) : 'Unknown';
    const teamName = userConfig?.team ? sanitize(userConfig.team) : 'Unknown';

    return `${userName}_${companyName}_${teamName}-vs_code_logg_collector`;
}

function getCollectionStateFile(globalStoragePath) {
    // If global storage path provided, use it (prevents loss on deletion)
    // Otherwise fall back to logs directory for backwards compatibility
    if (globalStoragePath) {
        return path.join(globalStoragePath, 'collection-state.json');
    }
    const logsDir = getPersistedLogsDirectory();
    return path.join(logsDir, 'collection-state.json');
}

function loadCollectionState(globalStoragePath) {
    const stateFile = getCollectionStateFile(globalStoragePath);
    try {
        if (fs.existsSync(stateFile)) {
            const data = fs.readFileSync(stateFile, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.warn('Could not load collection state:', error);
    }
    return { lastCollection: 0, processedFiles: [], fileSizes: {} };
}

function saveCollectionState(state, globalStoragePath) {
    const stateFile = getCollectionStateFile(globalStoragePath);
    try {
        const data = {
            lastCollection: state.lastCollection || Date.now(),
            processedFiles: Array.from(state.processedFiles || []),
            fileSizes: state.fileSizes || {}
        };
        fs.writeFileSync(stateFile, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Could not save collection state:', error);
    }
}

function parseLogTimestamp(filename) {
    const patterns = [
        /(\d{2}-\d{2}-\d{2})_SESSION_(\d{4}-\d{2}-\d{2})_GitHub Copilot/,
        /(\d{4}-\d{2}-\d{2}).*copilot/i,
        /copilot.*(\d{4}-\d{2}-\d{2})/i,
        /GitHub.*Copilot.*(\d{4}-\d{2}-\d{2})/i
    ];
    
    for (const pattern of patterns) {
        const match = filename.match(pattern);
        if (match) {
            if (match[2]) {
                const timeStr = match[1];
                const dateStr = match[2];
                try {
                    const [hours, minutes, seconds] = timeStr.split('-');
                    const timestamp = new Date(`${dateStr}T${hours}:${minutes}:${seconds}`);
                    if (!isNaN(timestamp.getTime())) {
                        return timestamp;
                    }
                } catch {}
            }
            if (match[1] && match[1].includes('-') && match[1].length >= 8) {
                try {
                    const timestamp = new Date(match[1]);
                    if (!isNaN(timestamp.getTime())) {
                        return timestamp;
                    }
                } catch {}
            }
        }
    }
    
    return null;
}


module.exports = {
    getVSCodeLogDirectories,
    findCopilotLogFiles,
    getPersistedLogsDirectory,
    loadCollectionState,
    saveCollectionState,
    parseLogTimestamp
};