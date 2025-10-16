const vscode = require('vscode');
const { getPersistedLogsDirectory } = require('./helpers');
const ConfigManager = require('./config-manager');
const StateManager = require('./state-manager');
const HealthChecker = require('./health-check');
const LogCollector = require('./collector');

// Global instances
let outputChannel;
let configManager;
let stateManager;
let healthChecker;
let logCollector;
let healthCheckTimer = null;
let autoCollectionTimer = null;

/**
 * Activate extension
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
    console.log('Extension "akvelon-gh-copilot-tracker" is now active!');

    // Initialize output channel
    outputChannel = vscode.window.createOutputChannel("Akvelon Copilot Tracker");
    outputChannel.appendLine("Extension activated!");

    // Initialize managers
    configManager = new ConfigManager(context, outputChannel);
    stateManager = new StateManager(context, outputChannel);
    healthChecker = new HealthChecker(stateManager, outputChannel, vscode, configManager);
    logCollector = new LogCollector(stateManager, configManager, outputChannel);

    // Ensure user configuration (one-time setup)
    await configManager.ensureUserConfiguration();

    // Run initial collection on startup
    logCollector.collectCopilotLogs(true).catch(error => {
        outputChannel.appendLine(`Initial collection failed: ${error.message}`);
    });

    // Register commands
    registerCommands(context);

    // Set up timers
    setupTimers();

    // Final messages
    // outputChannel.appendLine("Extension ready - health check every 5 minutes, auto-collection every 60 minutes");
    const userConfig = configManager.getConfig();
    outputChannel.appendLine("Logs saved to: " + getPersistedLogsDirectory(userConfig));
}

/**
 * Register VSCode commands
 */
function registerCommands(context) {
    // Manual log collection command
    const collectCommand = vscode.commands.registerCommand(
        'akvelon-gh-copilot-tracker.CollectLogs',
        async function () {
            try {
                outputChannel.clear();
                outputChannel.appendLine("Collecting GitHub Copilot logs...");

                await logCollector.collectCopilotLogs(false);

                outputChannel.show(true);
            } catch (error) {
                outputChannel.appendLine(`Command failed: ${error.message}`);
                vscode.window.showErrorMessage(`Extension is not working properly: ${error.message}`);
                outputChannel.show(true);
            }
        }
    );

    // Configuration command
    const configureCommand = vscode.commands.registerCommand(
        'akvelon-gh-copilot-tracker.Configure',
        async function () {
            try {
                outputChannel.clear();
                outputChannel.appendLine("Configuring user settings...");

                const config = await configManager.promptUserConfiguration();

                if (config) {
                    outputChannel.appendLine(`Configuration updated: ${config.userName} (${config.company} - ${config.team})`);
                } else {
                    outputChannel.appendLine('Configuration cancelled or skipped');
                }

                outputChannel.show(true);
            } catch (error) {
                outputChannel.appendLine(`Configuration failed: ${error.message}`);
                vscode.window.showErrorMessage(`Failed to configure: ${error.message}`);
                outputChannel.show(true);
            }
        }
    );

    context.subscriptions.push(collectCommand);
    context.subscriptions.push(configureCommand);
}

/**
 * Set up automatic timers
 */
function setupTimers() {
    // Health check every 5 minutes (first run immediately after 5 minutes)
    healthCheckTimer = setInterval(async () => {
        try {
            const healthStatus = await healthChecker.performHealthCheck();

            // If metrics were deleted, trigger re-collection
            if (healthStatus && healthStatus.needsRecollection) {
                outputChannel.appendLine(`🔄 Starting recovery: re-collecting logs to regenerate metrics...`);
                await logCollector.collectCopilotLogs(false, true);
            }
        } catch (error) {
            outputChannel.appendLine(`Health check failed: ${error.message}`);
        }
    }, 5 * 60 * 1000); // 5 minutes

    // Auto-collection every 60 minutes
    autoCollectionTimer = setInterval(async () => {
        try {
            await logCollector.collectCopilotLogs(true);
        } catch (error) {
            outputChannel.appendLine(`Auto-collection failed: ${error.message}`);
            outputChannel.appendLine(`Extension is not working properly during auto-collection`);
        }
    }, 60 * 60 * 1000); // 60 minutes
}

/**
 * Deactivate extension
 */
function deactivate() {
    // Clean up timers
    if (healthCheckTimer) {
        clearInterval(healthCheckTimer);
        healthCheckTimer = null;
    }
    if (autoCollectionTimer) {
        clearInterval(autoCollectionTimer);
        autoCollectionTimer = null;
    }
}

module.exports = {
    activate,
    deactivate
};
