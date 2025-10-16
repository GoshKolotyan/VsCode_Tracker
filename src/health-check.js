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
     * Focus: Only validate metrics directory and files (not source VS Code logs)
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

            // Check metrics directory and files
            const metricsDir = path.join(logsDir, 'metrics');
            const metricsCheck = this.checkMetricsDirectory(metricsDir);
            issues.push(...metricsCheck.issues);
            warnings.push(...metricsCheck.warnings);
            if (metricsCheck.needsRecollection) {
                needsRecollection = true;
            }

            // Build status report
            const status = {
                healthy: issues.length === 0,
                logsDirectory: logsDir,
                metricsDirectory: metricsDir,
                metricsFileCount: metricsCheck.metricsFileCount,
                hasMetrics: metricsCheck.hasMetrics,
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
     * Check metrics directory and validate files
     * This is the simplified health check that focuses only on what we actually persist
     */
    checkMetricsDirectory(metricsDir) {
        const issues = [];
        const warnings = [];
        let needsRecollection = false;
        let metricsFileCount = 0;
        let hasMetrics = false;

        // Check if metrics directory exists
        if (!fs.existsSync(metricsDir)) {
            // Check if we ever parsed logs before
            const parsingState = this.stateManager.loadParsingState();
            const hadPreviousParse = parsingState.lastParse && parsingState.lastParse > 0;

            if (hadPreviousParse) {
                // We had metrics before but directory is now gone
                issues.push('Metrics directory was deleted');
                warnings.push('Will regenerate metrics from source logs');
                needsRecollection = true;
            }
            // If we never parsed before, this is normal - no issue
        } else {
            // Directory exists, check for metrics files
            try {
                const files = fs.readdirSync(metricsDir);
                const metricFiles = files.filter(f => f.endsWith('.json') && f.startsWith('metrics_'));

                metricsFileCount = metricFiles.length;
                hasMetrics = metricsFileCount > 0;

                // Validate each metrics file
                for (const fileName of metricFiles) {
                    const filePath = path.join(metricsDir, fileName);
                    try {
                        const content = fs.readFileSync(filePath, 'utf8');
                        JSON.parse(content); // Validate it's valid JSON
                    } catch (error) {
                        issues.push(`Corrupted metrics file: ${fileName}`);
                        // Try to delete corrupted file
                        try {
                            fs.unlinkSync(filePath);
                            warnings.push(`Deleted corrupted file: ${fileName}`);
                            metricsFileCount--;
                        } catch (deleteError) {
                            warnings.push(`Could not delete corrupted file: ${fileName}`);
                        }
                        needsRecollection = true;
                    }
                }

                // Check if metrics directory is empty but we had data before
                if (metricsFileCount === 0) {
                    const parsingState = this.stateManager.loadParsingState();
                    const hadPreviousParse = parsingState.lastParse && parsingState.lastParse > 0;

                    if (hadPreviousParse) {
                        issues.push('All metrics files were deleted');
                        warnings.push('Will regenerate metrics from source logs');
                        needsRecollection = true;
                    }
                }
            } catch (error) {
                issues.push(`Error reading metrics directory: ${error.message}`);
                needsRecollection = true;
            }
        }

        return { issues, warnings, needsRecollection, metricsFileCount, hasMetrics };
    }

    /**
     * Log health status
     */
    logHealthStatus(status) {
        if (status.healthy) {
            this.outputChannel.appendLine(
                `✅ Health Check: OK (${status.metricsFileCount} metrics files)`
            );
        } else {
            this.outputChannel.appendLine(`⚠️ Health Check: ${status.issues.length} issue(s) found`);
            status.issues.forEach(issue => this.outputChannel.appendLine(`   - ${issue}`));
            if (status.warnings.length > 0) {
                status.warnings.forEach(warning => this.outputChannel.appendLine(`   ⚡ ${warning}`));
            }

            if (status.needsRecollection) {
                this.outputChannel.appendLine(`🔄 Metrics need regeneration - triggering collection from source logs`);

                // Show notification to user about deleted metrics
                this.showDeletionNotification(status);
            }
        }
    }

    /**
     * Show notification when metrics are deleted
     */
    showDeletionNotification(status) {
        if (!this.vscode) return;

        // Build a user-friendly message
        const hasMetricsDeletion = status.issues.some(issue =>
            issue.includes('Metrics') || issue.includes('metrics')
        );

        if (!hasMetricsDeletion) return;

        const message = `⚠️ GitHub Copilot Log Tracker: Metrics were deleted. Auto-recovery in progress...`;

        // Show warning notification in bottom-right corner
        this.vscode.window.showWarningMessage(message, 'View Output', 'Open Metrics Folder').then(selection => {
            if (selection === 'View Output') {
                this.outputChannel.show();
            } else if (selection === 'Open Metrics Folder') {
                const userConfig = this.configManager ? this.configManager.getConfig() : null;
                const logsDir = getPersistedLogsDirectory(userConfig);
                const metricsDir = path.join(logsDir, 'metrics');
                const uri = this.vscode.Uri.file(metricsDir);
                this.vscode.commands.executeCommand('revealFileInOS', uri);
            }
        });
    }
}

module.exports = HealthChecker;
