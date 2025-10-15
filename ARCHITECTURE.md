# System Architecture

## Module Structure

```
src/
├── extension.js           # Main entry point (activation, commands, timers)
├── config-manager.js      # User configuration (name, team)
├── state-manager.js       # Collection & parsing state management
├── health-check.js        # Health checks & recovery
├── collector.js           # Log collection logic
├── parser.js              # Log parsing (existing)
├── saver.js               # Saving logs & metrics (existing)
├── organised.js           # Log organization (existing)
└── helpers.js             # Utility functions (existing)
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                        extension.js                          │
│  (Orchestrates everything, handles VSCode lifecycle)         │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│config-manager│    │state-manager │    │health-check  │
│              │    │              │    │              │
│ - User config│    │ - Collection │    │ - Verify     │
│ - Name/Team  │    │ - Parsing    │    │ - Recover    │
└──────────────┘    └──────────────┘    └──────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  collector   │    │    parser    │    │    saver     │
│              │    │              │    │              │
│ - Find logs  │    │ - Parse logs │    │ - Save logs  │
│ - Read logs  │    │ - Aggregate  │    │ - Save JSON  │
└──────────────┘    └──────────────┘    └──────────────┘
```

## State Storage

### Global Storage (VSCode Extension Storage)
- **Location**: `~/.vscode/extensions/.../globalStorage/`
- **Survives**: Even if logs directory is deleted
- **Contents**:
  - `user_config.json` - User name and team
  - `collection-state.json` - Tracks collected log files
  - `parsing_state.json` - Tracks parsed content

### Persistent Storage (User Data)
- **Location**: `~/.copilot-logs/` (or user configured)
- **Contents**:
  - `YYYY-MM-DD/` - Date folders with collected logs
  - `metrics/` - Aggregated metrics JSON files
  - `*.tar.gz` - Daily archives

## Module Responsibilities

### 1. extension.js (Main)
- Initialize VSCode extension
- Register commands
- Set up timers (health check, auto-collection)
- Coordinate between modules

### 2. config-manager.js
```javascript
class ConfigManager {
  constructor(context)
  loadUserConfig()
  saveUserConfig(name, team)
  promptUserConfiguration()
  ensureUserConfiguration()
}
```

### 3. state-manager.js
```javascript
class StateManager {
  constructor(context)

  // Collection state
  loadCollectionState()
  saveCollectionState(state)

  // Parsing state
  loadParsingState()
  saveParsingState(state)

  // Reset states
  resetCollectionState()
  resetParsingState()
}
```

### 4. health-check.js
```javascript
class HealthChecker {
  constructor(stateManager, outputChannel)

  performHealthCheck()
  checkDirectories()
  checkStateIntegrity()
  checkFileDeletion()
  detectRecoveryNeeds()
}
```

### 5. collector.js (Refactor from extension.js)
```javascript
class LogCollector {
  constructor(stateManager, outputChannel)

  collectCopilotLogs(isAutoCollection, forceAll)
  parseAndSaveMetrics(isAutoCollection)
}
```

## Benefits of This Structure

1. **Separation of Concerns** - Each module has one responsibility
2. **Testability** - Modules can be tested independently
3. **Maintainability** - Easy to find and fix bugs
4. **Scalability** - Easy to add new features
5. **Readability** - Clear data flow and dependencies
