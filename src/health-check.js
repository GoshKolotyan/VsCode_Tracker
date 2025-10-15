const fs = require('fs');
const path = require('path');
const { getPersistedLogsDirectory } = require('./helpers');

/**
 * Performs health checks on logs and metrics
 * Detects file deletions and triggers recovery
 */
class HealthChecker {
    constructor(stateManager, outputChannel, vscode = null, configManager = null) {
        this.stateManager = stateManager;
        this.outputChannel = outputChannel;
        this.vscode = vscode;
        this.configManager = configManager;
    }

    /**
     * Perform comprehensive health check
     */
    async performHealthCheck() {
        try {
            const userConfig = this.configManager ? this.configManager.getConfig() : null;
            const logsDir = getPersistedLogsDirectory(userConfig);
            const issues = [];
            const warnings = [];
            let needsRecollection = false;

            // Check if base logs directory exists
            if (!fs.existsSync(logsDir)) {
                issues.push('Logs directory was deleted');
                fs.mkdirSync(logsDir, { recursive: true });
                warnings.push('Created missing logs directory');
                needsRecollection = true;
            }

            // Count current log and metric files
            const counts = this.countFiles(logsDir);

            // Check collection state
            const collectionCheck = this.checkCollectionState(counts.logFileCount);
            issues.push(...collectionCheck.issues);
            warnings.push(...collectionCheck.warnings);
            if (collectionCheck.needsRecollection) {
                needsRecollection = true;
            }

            // Check parsing state
            const parsingCheck = this.checkParsingState(counts.logFileCount);
            issues.push(...parsingCheck.issues);
            warnings.push(...parsingCheck.warnings);
            if (parsingCheck.needsRecollection) {
                needsRecollection = true;
            }

            // Check if metrics were deleted (only if parsing actually completed before)
            const metricsDir = path.join(logsDir, 'metrics');
            const hasMetricsDir = fs.existsSync(metricsDir);
            const hadSuccessfulParse = parsingCheck.lastParse > 0;

            if (!hasMetricsDir && hadSuccessfulParse && counts.metricsFileCount === 0) {
                // Metrics directory was deleted AND we had successfully parsed logs before
                issues.push('Metrics directory was deleted but logs were previously parsed');
                warnings.push('Will regenerate metrics from collected logs');
                needsRecollection = true;
            }

            // Validate existing metrics files
            const metricsCheck = this.validateMetricsFiles(counts.currentMetricFiles);
            issues.push(...metricsCheck.issues);
            warnings.push(...metricsCheck.warnings);
            if (metricsCheck.needsRecollection) {
                needsRecollection = true;
            }

            // Check if directory is empty but had data before
            const emptyCheck = this.checkEmptyDirectory(logsDir, collectionCheck.trackedFilesCount, parsingCheck.trackedFilesCount);
            issues.push(...emptyCheck.issues);
            warnings.push(...emptyCheck.warnings);
            if (emptyCheck.needsRecollection) {
                needsRecollection = true;
            }

            // Build status report
            const status = {
                healthy: issues.length === 0,
                logsDirectory: logsDir,
                logFileCount: counts.logFileCount,
                metricsFileCount: counts.metricsFileCount,
                collectionStateValid: collectionCheck.stateValid,
                parsingStateValid: parsingCheck.stateValid,
                needsRecollection,
                issues,
                warnings,
                timestamp: new Date().toISOString()
            };

            // Log results
            this.logHealthStatus(status);

            return status;
        } catch (error) {
            this.outputChannel.appendLine(`❌ Health check failed: ${error.message}`);
            return {
                healthy: false,
                needsRecollection: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Count log and metric files recursively
     */
    countFiles(logsDir) {
        let logFileCount = 0;
        let metricsFileCount = 0;
        const currentLogFiles = [];
        const currentMetricFiles = [];

        if (!fs.existsSync(logsDir)) {
            return { logFileCount, metricsFileCount, currentLogFiles, currentMetricFiles };
        }

        const walkDir = (dir) => {
            if (!fs.existsSync(dir)) return;
            try {
                const files = fs.readdirSync(dir);
                for (const file of files) {
                    if (file.startsWith('.')) continue; // Skip hidden files

                    const fullPath = path.join(dir, file);
                    let stat;
                    try {
                        stat = fs.statSync(fullPath);
                    } catch (e) {
                        continue;
                    }

                    if (stat.isDirectory() && file === 'metrics') {
                        // Count metrics files
                        const metricFiles = fs.readdirSync(fullPath);
                        metricFiles.forEach(f => {
                            if (f.endsWith('.json')) {
                                metricsFileCount++;
                                currentMetricFiles.push(path.join(fullPath, f));
                            }
                        });
                    } else if (stat.isDirectory()) {
                        // Recursively walk other directories
                        walkDir(fullPath);
                    } else if (stat.isFile() &&
                               (file.includes('GitHub Copilot') || file.includes('GitHub Copilot Chat')) &&
                               !file.includes('.hashes')) {
                        logFileCount++;
                        currentLogFiles.push(fullPath);
                    }
                }
            } catch (error) {
                console.warn(`Error reading directory ${dir}:`, error);
            }
        };

        walkDir(logsDir);
        return { logFileCount, metricsFileCount, currentLogFiles, currentMetricFiles };
    }

    /**
     * Check collection state integrity
     */
    checkCollectionState(currentLogCount) {
        const issues = [];
        const warnings = [];
        let needsRecollection = false;
        let stateValid = false;
        let trackedFilesCount = 0;

        const stateFile = this.stateManager.getCollectionStateFile();

        if (fs.existsSync(stateFile)) {
            try {
                const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
                stateValid = state.lastCollection !== undefined;

                if (state.processedFiles) {
                    const trackedFiles = Array.isArray(state.processedFiles)
                        ? state.processedFiles
                        : Array.from(state.processedFiles);

                    trackedFilesCount = trackedFiles.length;

                    // NOTE: We don't check if source VS Code log files exist anymore
                    // because VS Code rotates/deletes its own logs regularly.
                    // We only check if persistent storage has been deleted.

                    // If we have previous collections but no log files in persistent storage now
                    if (state.lastCollection && trackedFilesCount > 0 && currentLogCount === 0) {
                        issues.push(`All collected log files were deleted from persistent storage`);
                        needsRecollection = true;
                    }
                }
            } catch (error) {
                issues.push('Collection state file is corrupted');
                warnings.push('Will reset collection state');
                needsRecollection = true;
            }
        }

        return { issues, warnings, needsRecollection, stateValid, trackedFilesCount };
    }

    /**
     * Check parsing state integrity
     */
    checkParsingState(currentLogCount) {
        const issues = [];
        const warnings = [];
        let needsRecollection = false;
        let stateValid = false;
        let trackedFilesCount = 0;
        let lastParse = 0;

        const stateFile = this.stateManager.getParsingStateFile();

        if (fs.existsSync(stateFile)) {
            try {
                const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
                stateValid = state.processedFiles !== undefined;
                lastParse = state.lastParse || 0;

                if (state.processedFiles) {
                    const trackedFiles = Object.keys(state.processedFiles);
                    trackedFilesCount = trackedFiles.length;

                    // Check if tracked files in persistent storage were deleted
                    let missingFilesCount = 0;
                    const missingFiles = [];
                    for (const file of trackedFiles) {
                        if (!fs.existsSync(file)) {
                            missingFilesCount++;
                            missingFiles.push(file);
                        }
                    }

                    // Only report if ALL files are missing (directory was deleted)
                    // or if more than 50% are missing (major deletion event)
                    const deletionThreshold = trackedFilesCount > 1 ? trackedFilesCount * 0.5 : 1;

                    if (missingFilesCount >= deletionThreshold) {
                        issues.push(`${missingFilesCount}/${trackedFilesCount} parsed files were deleted from persistent storage`);

                        // Clean up references to missing files from state
                        for (const missingFile of missingFiles) {
                            delete state.processedFiles[missingFile];
                        }
                        this.stateManager.saveParsingState(state);
                        warnings.push('Cleaned up parsing state for deleted files');
                        needsRecollection = true;
                    }

                    // If we had parsed files but now have none in persistent storage
                    if (state.lastParse && trackedFilesCount > 0 && currentLogCount === 0) {
                        issues.push('All parsed log files were deleted from persistent storage');
                        this.stateManager.resetParsingState();
                        warnings.push('Reset parsing state due to complete deletion');
                        needsRecollection = true;
                    }
                }
            } catch (error) {
                issues.push('Parsing state file is corrupted');
                warnings.push('Will reset parsing state');
                this.stateManager.resetParsingState();
                needsRecollection = true;
            }
        }

        return { issues, warnings, needsRecollection, stateValid, trackedFilesCount, lastParse };
    }

    /**
     * Validate metrics JSON files
     */
    validateMetricsFiles(metricFiles) {
        const issues = [];
        const warnings = [];
        let needsRecollection = false;

        for (const filePath of metricFiles) {
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                JSON.parse(content);
            } catch (error) {
                const fileName = path.basename(filePath);
                issues.push(`Corrupted metrics file: ${fileName}`);
                fs.unlinkSync(filePath);
                warnings.push(`Deleted corrupted file: ${fileName}`);
                needsRecollection = true;
            }
        }

        return { issues, warnings, needsRecollection };
    }

    /**
     * Check if directory is empty but had data before
     */
    checkEmptyDirectory(logsDir, collectionTrackedCount, parsingTrackedCount) {
        const issues = [];
        const warnings = [];
        let needsRecollection = false;

        if (fs.existsSync(logsDir)) {
            const allFiles = fs.readdirSync(logsDir);

            // State files that don't count as "data"
            const stateFiles = ['collection-state.json', 'parsing_state.json', 'user_config.json', 'metrics'];

            // Check if there are any actual data files (log directories, archives, etc.)
            const hasDataFiles = allFiles.some(f => {
                // Skip hidden files
                if (f.startsWith('.')) return false;

                // Skip state files
                if (stateFiles.includes(f)) return false;

                // Check for date directories (YYYY-MM-DD format)
                if (/^\d{4}-\d{2}-\d{2}$/.test(f)) return true;

                // Check for archive files
                if (f.endsWith('.tar.gz')) return true;

                return false;
            });

            if (!hasDataFiles && (collectionTrackedCount > 0 || parsingTrackedCount > 0)) {
                issues.push('Persistent storage is empty but data was previously collected');
                warnings.push('All collected log files and date directories were deleted');
                needsRecollection = true;

                // Reset states to force fresh collection
                this.stateManager.resetCollectionState();
                this.stateManager.resetParsingState();
            }
        }

        return { issues, warnings, needsRecollection };
    }

    /**
     * Log health status
     */
    logHealthStatus(status) {
        if (status.healthy) {
            this.outputChannel.appendLine(
                `✅ Health Check: OK (${status.logFileCount} logs, ${status.metricsFileCount} metrics)`
            );
        } else {
            this.outputChannel.appendLine(`⚠️ Health Check: ${status.issues.length} issue(s) found`);
            status.issues.forEach(issue => this.outputChannel.appendLine(`   - ${issue}`));
            if (status.warnings.length > 0) {
                status.warnings.forEach(warning => this.outputChannel.appendLine(`   ⚡ ${warning}`));
            }

            if (status.needsRecollection) {
                this.outputChannel.appendLine(`🔄 Files were deleted - triggering full re-collection and re-parsing`);

                // Show notification to user about deleted logs
                this.showDeletionNotification(status);
            }
        }
    }

    /**
     * Show notification when logs are deleted
     */
    showDeletionNotification(status) {
        if (!this.vscode) return;

        // Build a user-friendly message
        const deletedItems = [];
        const hasLogDeletion = status.issues.some(issue =>
            issue.includes('log files were deleted') ||
            issue.includes('Logs directory was deleted') ||
            issue.includes('storage is empty')
        );
        const hasMetricsDeletion = status.issues.some(issue =>
            issue.includes('Metrics directory was deleted')
        );

        if (hasLogDeletion) {
            deletedItems.push('collected logs');
        }
        if (hasMetricsDeletion) {
            deletedItems.push('metrics');
        }

        if (deletedItems.length === 0) return;

        const message = `⚠️ GitHub Copilot Log Tracker: ${deletedItems.join(' and ')} were deleted. Auto-recovery in progress...`;

        // Show warning notification in bottom-right corner
        this.vscode.window.showWarningMessage(message, 'View Output', 'Open Logs Folder').then(selection => {
            if (selection === 'View Output') {
                this.outputChannel.show();
            } else if (selection === 'Open Logs Folder') {
                const userConfig = this.configManager ? this.configManager.getConfig() : null;
                const logsDir = getPersistedLogsDirectory(userConfig);
                const uri = this.vscode.Uri.file(logsDir);
                this.vscode.commands.executeCommand('revealFileInOS', uri);
            }
        });
    }
}

module.exports = HealthChecker;
