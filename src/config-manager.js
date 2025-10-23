const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const { getPersistedLogsDirectory } = require('./helpers');

/**
 * Manages user configuration (name and team)
 * Stores config in .copilot-logs directory
 */
class ConfigManager {
    constructor(context, outputChannel) {
        this.context = context;
        this.outputChannel = outputChannel;
        this.config = null;
    }

    /**
     * Get config storage path (use VSCode's global storage temporarily)
     */
    getConfigStoragePath() {
        // Use VSCode's global storage for config to avoid circular dependency
        const globalStoragePath = this.context.globalStorageUri.fsPath;
        if (!fs.existsSync(globalStoragePath)) {
            fs.mkdirSync(globalStoragePath, { recursive: true });
        }
        return globalStoragePath;
    }

    /**
     * Get config file path
     */
    getConfigFilePath() {
        return path.join(this.getConfigStoragePath(), 'user_config.json');
    }

    /**
     * Load user configuration
     */
    loadUserConfig() {
        try {
            const configFile = this.getConfigFilePath();
            if (fs.existsSync(configFile)) {
                this.config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
                return this.config;
            }
        } catch (error) {
            this.outputChannel.appendLine(`Error loading user config: ${error.message}`);
        }
        return null;
    }

    /**
     * Copy config to main logs directory for user access
     */
    copyConfigToLogsDirectory(userConfig) {
        try {
            const { getPersistedLogsDirectory } = require('./helpers');
            const logsDir = getPersistedLogsDirectory(userConfig);
            const destFile = path.join(logsDir, 'user_config.json');

            fs.writeFileSync(destFile, JSON.stringify(userConfig, null, 2), 'utf8');
        } catch (error) {
            this.outputChannel.appendLine(`Error copying config to logs directory: ${error.message}`);
        }
    }

    /**
     * Save user configuration
     */
    saveUserConfig(userName, company, team) {
        try {
            const configFile = this.getConfigFilePath();
            this.config = {
                userName,
                company,
                team,
                configuredAt: new Date().toISOString()
            };
            fs.writeFileSync(configFile, JSON.stringify(this.config, null, 2), 'utf8');

            // Also copy to logs directory for easy access
            this.copyConfigToLogsDirectory(this.config);

            return this.config;
        } catch (error) {
            this.outputChannel.appendLine(`Error saving user config: ${error.message}`);
            throw error;
        }
    }

    /**
     * Prompt user for configuration
     */
    async promptUserConfiguration() {
        try {
            // Show welcome message
            const shouldConfigure = await vscode.window.showInformationMessage(
                'Welcome to Copilot Logger!\n\nTo track your metrics, please configure your information.',
                'Configure Now',
                'Skip for Now'
            );

            if (shouldConfigure !== 'Configure Now') {
                this.outputChannel.appendLine('User skipped configuration - using defaults');
                return null;
            }

            // Ask for user name
            const userName = await vscode.window.showInputBox({
                prompt: 'Enter your name (or press ESC to skip)',
                placeHolder: 'e.g., John Doe',
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'User name is required (or press ESC to skip)';
                    }
                    return null;
                }
            });

            if (!userName) {
                this.outputChannel.appendLine('User cancelled name input - using defaults');
                return null;
            }

            // Ask for company
            const company = await vscode.window.showInputBox({
                prompt: 'Enter your company name (or press ESC to skip)',
                placeHolder: 'e.g., Acme Corp',
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'Company name is required (or press ESC to skip)';
                    }
                    return null;
                }
            });

            if (!company) {
                this.outputChannel.appendLine('User cancelled company input - using defaults');
                return null;
            }

            // Ask for team
            const team = await vscode.window.showInputBox({
                prompt: 'Enter your team name (or press ESC to skip)',
                placeHolder: 'e.g., Engineering, DevOps, etc.',
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'Team name is required (or press ESC to skip)';
                    }
                    return null;
                }
            });

            if (!team) {
                this.outputChannel.appendLine('User cancelled team input - using defaults');
                return null;
            }

            // Save configuration
            const config = this.saveUserConfig(userName.trim(), company.trim(), team.trim());

            vscode.window.showInformationMessage(
                `✅ Configuration saved! User: ${config.userName}, Company: ${config.company}, Team: ${config.team}`
            );

            return config;
        } catch (error) {
            this.outputChannel.appendLine(`Error during configuration: ${error.message}`);
            return null;
        }
    }

    /**
     * Ensure user configuration exists (load or prompt)
     */
    async ensureUserConfiguration() {
        this.config = this.loadUserConfig();

        if (!this.config) {
            this.outputChannel.appendLine('First time setup - requesting user configuration...');
            this.config = await this.promptUserConfiguration();

            if (!this.config) {
                // Use defaults if user cancels
                this.outputChannel.appendLine('Using default configuration');
                this.config = { userName: 'Unknown', company: 'Unknown', team: 'Unknown' };
            }
        } else {
            this.outputChannel.appendLine(`Loaded user config: ${this.config.userName} (${this.config.company} - ${this.config.team})`);
        }

        return this.config;
    }

    /**
     * Get current config
     */
    getConfig() {
        return this.config || { userName: 'Unknown', company: 'Unknown', team: 'Unknown' };
    }
}

module.exports = ConfigManager;
