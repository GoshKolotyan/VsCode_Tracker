const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const { getVSCodeLogDirectories, findCopilotLogFiles, parseLogTimestamp } = require('./helpers');
const { getPersistedLogsDirectory, saveMetricsToJSON } = require('./saver');
const CopilotParser = require('./parser');

/**
 * Handles log collection, parsing, and saving
 */
class LogCollector {
    constructor(stateManager, configManager, outputChannel) {
        this.stateManager = stateManager;
        this.configManager = configManager;
        this.outputChannel = outputChannel;
        this.collectionState = null;
    }

    /**
     * Initialize collection state
     */
    initializeState() {
        if (!this.collectionState) {
            this.collectionState = this.stateManager.loadCollectionState();
            this.collectionState.processedFiles = new Set(this.collectionState.processedFiles || []);
            this.collectionState.fileSizes = this.collectionState.fileSizes || {};
        }
    }

    /**
     * Collect GitHub Copilot logs
     */
    async collectCopilotLogs(isAutoCollection = false, forceAll = false) {
        try {
            this.initializeState();

            const progressOptions = {
                location: isAutoCollection ? vscode.ProgressLocation.Window : vscode.ProgressLocation.Notification,
                title: isAutoCollection ? "Auto-collecting Copilot logs..." : "Collecting GitHub Copilot logs...",
                cancellable: false
            };

            await vscode.window.withProgress(progressOptions, async (progress) => {
                progress.report({ increment: 0 });

                // Get possible log directories
                const vscodeDirs = getVSCodeLogDirectories();
                progress.report({ increment: 20, message: "Searching for log files..." });

                // Find all log files
                const logFiles = [];
                for (const dir of vscodeDirs) {
                    if (fs.existsSync(dir)) {
                        const files = await findCopilotLogFiles(dir);
                        logFiles.push(...files);
                    }
                }

                // Filter for new files
                const newLogFiles = forceAll ? logFiles : this.filterNewFiles(logFiles);

                if (newLogFiles.length === 0 && isAutoCollection) {
                    const timestamp = new Date().toLocaleString();
                    this.outputChannel.appendLine(`No new logs detected at ${timestamp}`);
                    return;
                }

                if (logFiles.length === 0) {
                    if (!isAutoCollection) {
                        vscode.window.showWarningMessage('No GitHub Copilot log files found.');
                    }
                    return;
                }

                if (newLogFiles.length === 0 && !isAutoCollection) {
                    await this.handleNoNewFiles();
                    return;
                }

                if (isAutoCollection && newLogFiles.length > 0) {
                    this.logNewFilesFound(newLogFiles);
                }

                progress.report({ increment: 40, message: `Processing ${newLogFiles.length} new log files...` });

                const userConfig = this.configManager.getConfig();

                // Update collection state
                this.updateCollectionState(newLogFiles);

                progress.report({ increment: 70, message: "Parsing logs and generating metrics..." });

                // Parse logs directly from source and save metrics only
                await this.parseAndSaveMetricsDirectly(newLogFiles, isAutoCollection, userConfig);

                // Show completion message (only for manual collection)
                if (!isAutoCollection) {
                    await this.showCompletionMessage();
                }
            });
        } catch (error) {
            this.outputChannel.appendLine(`Error during log collection: ${error.message}`);
            if (!isAutoCollection) {
                vscode.window.showErrorMessage(`Extension failed to collect logs: ${error.message}`);
            }
            throw error;
        }
    }

    /**
     * Filter for new files based on timestamps and sizes
     */
    filterNewFiles(logFiles) {
        return logFiles.filter(file => {
            const stat = fs.statSync(file);
            const filename = path.basename(file);

            // Check if file size has increased
            const currentSize = stat.size;
            const lastKnownSize = this.collectionState.fileSizes[file] || 0;
            const sizeIncreased = currentSize > lastKnownSize;

            // Check modification time
            const fileModified = stat.mtime.getTime() > this.collectionState.lastCollection;

            // Try to parse timestamp from filename
            const parsedTimestamp = parseLogTimestamp(filename);
            const filenameNewer = parsedTimestamp && parsedTimestamp.getTime() > this.collectionState.lastCollection;

            return sizeIncreased || fileModified || filenameNewer;
        });
    }

    /**
     * Handle case when no new files are found
     */
    async handleNoNewFiles() {
        const userConfig = this.configManager.getConfig();
        const logsDir = getPersistedLogsDirectory(userConfig);
        const viewLogs = 'View Existing Logs';
        const forceRecollect = 'Force Re-collect All';

        const result = await vscode.window.showInformationMessage(
            `No new log files found since last collection.\n${this.collectionState.processedFiles.size} files already processed.`,
            viewLogs,
            forceRecollect
        );

        if (result === viewLogs) {
            const uri = vscode.Uri.file(logsDir);
            vscode.commands.executeCommand('revealFileInOS', uri);
        } else if (result === forceRecollect) {
            await this.collectCopilotLogs(false, true);
        }
    }

    /**
     * Log newly found files for auto-collection
     */
    logNewFilesFound(newLogFiles) {
        const timestamp = new Date().toLocaleString();
        this.outputChannel.appendLine(`🆕 Found ${newLogFiles.length} new log files at ${timestamp}:`);
        newLogFiles.forEach((file, i) => {
            const filename = path.basename(file);
            const stat = fs.statSync(file);
            this.outputChannel.appendLine(`   ${i + 1}. ${filename} (${stat.size} bytes, modified: ${stat.mtime.toISOString()})`);
        });
    }

    /**
     * Log auto-collection statistics
     */
    logAutoCollectionStats(saveStats) {
        let totalLines = 0;
        for (const files of Object.values(saveStats)) {
            for (const lineCount of Object.values(files)) {
                totalLines += lineCount;
            }
        }

        if (totalLines > 0) {
            const timestamp = new Date().toLocaleString();
            const userConfig = this.configManager.getConfig();
            const logsDir = getPersistedLogsDirectory(userConfig);
            this.outputChannel.appendLine(`Logs collected and saved in ${logsDir} (${totalLines} new lines) at ${timestamp}`);
        }
    }

    /**
     * Update collection state with newly processed files
     */
    updateCollectionState(newLogFiles) {
        this.collectionState.lastCollection = Date.now();
        newLogFiles.forEach(file => {
            this.collectionState.processedFiles.add(file);
            const stat = fs.statSync(file);
            this.collectionState.fileSizes[file] = stat.size;
        });

        this.stateManager.saveCollectionState(this.collectionState);
    }

    /**
     * Show completion message for manual collection
     */
    async showCompletionMessage() {
        const userConfig = this.configManager.getConfig();
        const logsDir = getPersistedLogsDirectory(userConfig);
        const metricsDir = path.join(logsDir, 'metrics');
        const openFolder = 'Open Metrics Folder';

        const result = await vscode.window.showInformationMessage(
            `Metrics saved to:\n${metricsDir}`,
            openFolder
        );

        if (result === openFolder) {
            const uri = vscode.Uri.file(metricsDir);
            vscode.commands.executeCommand('revealFileInOS', uri);
        }
    }

    /**
     * Parse collected logs incrementally and save metrics
     */
    async parseAndSaveMetrics(isAutoCollection = false, userConfig = null) {
        try {
            if (!userConfig) {
                userConfig = this.configManager.getConfig();
            }
            const logsDir = getPersistedLogsDirectory(userConfig);
            const parser = new CopilotParser();

            // Load parsing state
            let parsingState = this.stateManager.loadParsingState();

            // Get all collected log files
            const { copilotFiles, chatFiles } = this.findCollectedLogs(logsDir);

            // Filter for new or modified files
            const newCopilotFiles = this.filterNewParsedFiles(copilotFiles, parsingState);
            const newChatFiles = this.filterNewParsedFiles(chatFiles, parsingState);

            if (newCopilotFiles.length === 0 && newChatFiles.length === 0) {
                if (!isAutoCollection) {
                    this.outputChannel.appendLine('No new log entries to parse.');
                }
                return null;
            }

            // Get user info for parsing
            const userName = userConfig.userName || 'Unknown';
            const companyName = userConfig.company || 'Unknown';
            const teamName = userConfig.team || 'Unknown';

            // Parse new content
            const copilotRecords = newCopilotFiles.flatMap(f =>
                this.parseFileIncremental(f, false, parser, parsingState, userName, companyName, teamName)
            );
            const chatRecords = newChatFiles.flatMap(f =>
                this.parseFileIncremental(f, true, parser, parsingState, userName, companyName, teamName)
            );

            const allRecords = [...copilotRecords, ...chatRecords];

            if (allRecords.length === 0) {
                if (!isAutoCollection) {
                    this.outputChannel.appendLine('No new log entries found to parse.');
                }
                this.stateManager.saveParsingState(parsingState);
                return null;
            }

            const aggregated = CopilotParser.aggregate(allRecords);

            // Save metrics to JSON
            const savedFiles = await saveMetricsToJSON(aggregated, userConfig);

            // Update parsing state
            parsingState.lastParse = Date.now();
            this.stateManager.saveParsingState(parsingState);

            const result = {
                totalRecords: allRecords.length,
                aggregatedMetrics: Object.keys(aggregated).length,
                savedFiles: savedFiles
            };

            if (isAutoCollection) {
                this.outputChannel.appendLine(`Parsed ${result.totalRecords} new log entries, ${result.aggregatedMetrics} unique metrics`);
                this.outputChannel.appendLine(`Updated: ${savedFiles.join(', ')}`);
            }

            return result;
        } catch (error) {
            this.outputChannel.appendLine(`Error parsing logs: ${error.message}`);
            if (!isAutoCollection) {
                vscode.window.showErrorMessage(`Failed to parse logs: ${error.message}`);
            }
            return null;
        }
    }

    /**
     * Find collected log files in persistent storage
     */
    findCollectedLogs(logsDir) {
        const copilotFiles = [];
        const chatFiles = [];

        const walkDir = (dir) => {
            if (!fs.existsSync(dir)) return;
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const fullPath = path.join(dir, file);
                const stat = fs.statSync(fullPath);

                if (stat.isDirectory() && file !== 'metrics') {
                    walkDir(fullPath);
                } else if (file.includes('GitHub Copilot Chat')) {
                    chatFiles.push(fullPath);
                } else if (file.includes('GitHub Copilot')) {
                    copilotFiles.push(fullPath);
                }
            }
        };

        walkDir(logsDir);
        return { copilotFiles, chatFiles };
    }

    /**
     * Filter files that need parsing
     */
    filterNewParsedFiles(files, parsingState) {
        return files.filter(file => {
            const stat = fs.statSync(file);
            const lastSize = parsingState.processedFiles[file] || 0;
            return stat.size > lastSize;
        });
    }

    /**
     * Parse file incrementally from last position
     */
    parseFileIncremental(file, isChat, parser, parsingState, userName, companyName, teamName) {
        const lastSize = parsingState.processedFiles[file] || 0;
        const content = fs.readFileSync(file, 'utf8');

        // Only parse content after the last processed position
        const newContent = content.substring(lastSize);
        const lines = newContent.split('\n');

        const records = [];
        for (const line of lines) {
            let result;
            if (isChat) {
                result = parser.parseChatLine(line, userName, companyName, teamName);
            } else {
                result = parser.parseCopilotLine(line, userName, companyName, teamName);
            }
            if (result) {
                records.push(result);
            }
        }

        // Update processed size
        parsingState.processedFiles[file] = content.length;

        return records;
    }

    /**
     * Parse logs directly from source files and save only metrics
     */
    async parseAndSaveMetricsDirectly(logFiles, isAutoCollection = false, userConfig = null) {
        try {
            if (!userConfig) {
                userConfig = this.configManager.getConfig();
            }

            const parser = new CopilotParser();
            let parsingState = this.stateManager.loadParsingState();

            // Get user info for parsing
            const userName = userConfig.userName || 'Unknown';
            const companyName = userConfig.company || 'Unknown';
            const teamName = userConfig.team || 'Unknown';

            // Separate chat and copilot files
            const copilotFiles = [];
            const chatFiles = [];

            for (const file of logFiles) {
                const fileName = path.basename(file);
                if (fileName.includes('Chat')) {
                    chatFiles.push(file);
                } else {
                    copilotFiles.push(file);
                }
            }

            // Filter for new or modified files
            const newCopilotFiles = this.filterNewParsedFiles(copilotFiles, parsingState);
            const newChatFiles = this.filterNewParsedFiles(chatFiles, parsingState);

            this.outputChannel.appendLine(`📂 Found ${copilotFiles.length} copilot files, ${chatFiles.length} chat files`);
            this.outputChannel.appendLine(`🆕 New/modified: ${newCopilotFiles.length} copilot, ${newChatFiles.length} chat`);

            if (newCopilotFiles.length === 0 && newChatFiles.length === 0) {
                if (!isAutoCollection) {
                    this.outputChannel.appendLine('No new log entries to parse (all files already processed at current size).');
                }
                return null;
            }

            // Parse new content
            const copilotRecords = newCopilotFiles.flatMap(f =>
                this.parseFileIncremental(f, false, parser, parsingState, userName, companyName, teamName)
            );
            const chatRecords = newChatFiles.flatMap(f =>
                this.parseFileIncremental(f, true, parser, parsingState, userName, companyName, teamName)
            );

            const allRecords = [...copilotRecords, ...chatRecords];

            if (allRecords.length === 0) {
                if (!isAutoCollection) {
                    this.outputChannel.appendLine('No new log entries found to parse.');
                }
                this.stateManager.saveParsingState(parsingState);
                return null;
            }

            const aggregated = CopilotParser.aggregate(allRecords);

            // Save metrics to JSON
            const savedFiles = await saveMetricsToJSON(aggregated, userConfig);

            // Update parsing state
            parsingState.lastParse = Date.now();
            this.stateManager.saveParsingState(parsingState);

            const result = {
                totalRecords: allRecords.length,
                aggregatedMetrics: Object.keys(aggregated).length,
                savedFiles: savedFiles
            };

            if (isAutoCollection) {
                this.outputChannel.appendLine(`Parsed ${result.totalRecords} new log entries, ${result.aggregatedMetrics} unique metrics`);
                this.outputChannel.appendLine(`Updated: ${savedFiles.join(', ')}`);
            } else {
                this.outputChannel.appendLine(`✅ Parsed ${result.totalRecords} log entries`);
                this.outputChannel.appendLine(`📊 Generated ${result.aggregatedMetrics} unique metrics`);
                this.outputChannel.appendLine(`💾 Saved to: ${savedFiles.join(', ')}`);
            }

            return result;
        } catch (error) {
            this.outputChannel.appendLine(`Error parsing logs: ${error.message}`);
            if (!isAutoCollection) {
                vscode.window.showErrorMessage(`Failed to parse logs: ${error.message}`);
            }
            return null;
        }
    }
}

module.exports = LogCollector;
