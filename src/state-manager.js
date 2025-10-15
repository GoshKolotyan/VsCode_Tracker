const fs = require('fs');
const path = require('path');

/**
 * Manages collection and parsing state
 * Stores state in VSCode global storage and copies to logs directory
 */
class StateManager {
    constructor(context, outputChannel) {
        this.context = context;
        this.outputChannel = outputChannel;
    }

    /**
     * Get state storage path (use VSCode's global storage)
     */
    getStateStoragePath() {
        // Use VSCode's global storage to avoid circular dependency
        const globalStoragePath = this.context.globalStorageUri.fsPath;
        if (!fs.existsSync(globalStoragePath)) {
            fs.mkdirSync(globalStoragePath, { recursive: true });
        }
        return globalStoragePath;
    }

    /**
     * Copy state file to main logs directory for user access
     */
    copyStateToLogsDirectory(fileName, data) {
        try {
            // Load user config to determine directory
            const configFile = path.join(this.getStateStoragePath(), 'user_config.json');
            if (!fs.existsSync(configFile)) return;

            const userConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));
            const { getPersistedLogsDirectory } = require('./helpers');
            const logsDir = getPersistedLogsDirectory(userConfig);
            const destFile = path.join(logsDir, fileName);

            fs.writeFileSync(destFile, JSON.stringify(data, null, 2), 'utf8');
        } catch (error) {
            // Silent fail - this is just a convenience copy
        }
    }

    /**
     * Get collection state file path
     */
    getCollectionStateFile() {
        return path.join(this.getStateStoragePath(), 'collection-state.json');
    }

    /**
     * Get parsing state file path
     */
    getParsingStateFile() {
        return path.join(this.getStateStoragePath(), 'parsing_state.json');
    }

    /**
     * Load collection state
     */
    loadCollectionState() {
        const stateFile = this.getCollectionStateFile();
        try {
            if (fs.existsSync(stateFile)) {
                const data = fs.readFileSync(stateFile, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            this.outputChannel.appendLine(`Error loading collection state: ${error.message}`);
        }
        return { lastCollection: 0, processedFiles: [], fileSizes: {} };
    }

    /**
     * Save collection state
     */
    saveCollectionState(state) {
        const stateFile = this.getCollectionStateFile();
        try {
            const data = {
                lastCollection: state.lastCollection || Date.now(),
                processedFiles: Array.from(state.processedFiles || []),
                fileSizes: state.fileSizes || {}
            };
            fs.writeFileSync(stateFile, JSON.stringify(data, null, 2), 'utf8');

            // Also copy to logs directory for easy access
            this.copyStateToLogsDirectory('collection-state.json', data);
        } catch (error) {
            this.outputChannel.appendLine(`Error saving collection state: ${error.message}`);
        }
    }

    /**
     * Load parsing state
     */
    loadParsingState() {
        const stateFile = this.getParsingStateFile();
        try {
            if (fs.existsSync(stateFile)) {
                const data = fs.readFileSync(stateFile, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            this.outputChannel.appendLine(`Error loading parsing state: ${error.message}`);
        }
        return { processedFiles: {}, lastParse: 0 };
    }

    /**
     * Save parsing state
     */
    saveParsingState(state) {
        const stateFile = this.getParsingStateFile();
        try {
            fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');

            // Also copy to logs directory for easy access
            this.copyStateToLogsDirectory('parsing_state.json', state);
        } catch (error) {
            this.outputChannel.appendLine(`Error saving parsing state: ${error.message}`);
        }
    }

    /**
     * Reset collection state
     */
    resetCollectionState() {
        const stateFile = this.getCollectionStateFile();
        try {
            if (fs.existsSync(stateFile)) {
                fs.unlinkSync(stateFile);
                this.outputChannel.appendLine('Collection state reset');
            }
        } catch (error) {
            this.outputChannel.appendLine(`Error resetting collection state: ${error.message}`);
        }
    }

    /**
     * Reset parsing state
     */
    resetParsingState() {
        const stateFile = this.getParsingStateFile();
        try {
            if (fs.existsSync(stateFile)) {
                fs.unlinkSync(stateFile);
                this.outputChannel.appendLine('Parsing state reset');
            }
        } catch (error) {
            this.outputChannel.appendLine(`Error resetting parsing state: ${error.message}`);
        }
    }

    /**
     * Get all state files
     */
    getStateFiles() {
        return {
            collection: this.getCollectionStateFile(),
            parsing: this.getParsingStateFile()
        };
    }
}

module.exports = StateManager;
