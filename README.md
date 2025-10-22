# Akvelon Copilot Insights for VS Code

**Understand how GitHub Copilot is being used across your VS Code workspace — locally and securely.**

This lightweight extension tracks Copilot completions and chat sessions, aggregates metrics, and saves them as structured JSON reports — all without sending any data online.

🔹 **Fully local tracking** — no external servers, no telemetry
🔹 **Automatic background collection** every 60 minutes
🔹 **Simple insights** into completions, chats, and daily activity trends
🔹 **Configurable storage path** and customizable metadata (user, team, company)

Perfect for developers and engineering teams who want visibility into Copilot usage while preserving complete privacy.

## 🔒 Privacy First

- ✅ Only collects Copilot logs (no code, no personal data)
- ✅ Everything stays on your computer
- ✅ No internet connection needed
- ✅ Open source and transparent

## 📦 Quick Start

### What You Need
- VS Code 1.104.0+
- GitHub Copilot extension
- Active Copilot subscription

### Install & Setup

1. **Install the extension** from the VS Code Marketplace

2. **Configure your details** (first time only)
   * Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
   * Type: `Copilot: Configure User Settings`
   * Enter your name, company, and team when prompted

3. **Test the installation**

   * Press `Ctrl+Shift+P`
   * Type: `Collect Logs` and press **Enter**
   * A window will open with a button. Click it to navigate to the logs folder
   * You should see folders with dates and log files inside
   * If something goes wrong, an error message will appear

**Done!** The extension now runs automatically every 60 minutes.

## 📁 Where Are My Logs?

Default location: `~/Desktop/{userName}_{company}_{team}-vs_code_log_collector/`

Example: `~/Desktop/John_Doe_Akvelon_Team1-vs_code_log_collector/`

```
John_Doe_Akvelon_Team1-vs_code_log_collector/
├── metrics/
│   └── metrics_2025-10-15.json
├── collection-state.json
├── parsing_state.json
└── user_config.json
```

### What's Inside the Metrics File?

The `metrics_YYYY-MM-DD.json` file contains structured Copilot usage data. Each entry tracks individual interactions:

```json
{
  "date": "2025-10-08",
  "source": "copilot",
  "servedBy": "unknown-model",
  "action": "completion",
  "numRequests": 3,
  "name": "[CONFIDENTIAL]",
  "team": "[CONFIDENTIAL]",
  "company": "[CONFIDENTIAL]",
  "ide": "Visual Studio Code"
}
```

**Fields explained:**
- `date`: When the activity occurred
- `source`: Always "copilot" for Copilot interactions
- `action`: Type of interaction (completion, chat, etc.)
- `numRequests`: Number of requests in this interaction
- `name`, `team`, `company`: User and organization details from your config
- `ide`: Your development environment

**Note:** For users with multiple machines or shared workspaces, consider setting a custom log directory path with a machine identifier to avoid conflicts (see Settings section below).

## ⚙️ Settings (Optional)

Want to change where logs are saved?

1. Open Settings: `Ctrl+,` (or `Cmd+,` on Mac)
2. Search: `Akvelon Copilot Tracker`
3. Set your preferred folder path
4. Reload VS Code: `Ctrl+Shift+P` → `Reload Window`

## 🔧 Problems?

**No logs appearing?**
- Make sure GitHub Copilot is active
- Use Copilot a few times (suggestions or chat)
- Run `Collect Logs` command manually

**Folder not created?**
- Check you have write permissions in your home folder
- Try setting a custom folder path in Settings
- Look for error messages in the notification popup

**Still stuck?**
- Check `View → Output → Akvelon Copilot Tracker` for details
- Restart VS Code
- Reinstall the extension

## 📝 What Gets Collected?

**YES** ✅
- Copilot completion logs
- Copilot chat logs
- Usage timestamps

**NO** ❌
- Your code
- API keys or passwords
- Personal information
- Anything outside Copilot logs

**All data stays on your machine. Nothing is sent anywhere.**

## ⚠️ User Consent & Privacy

By using this extension, you acknowledge that:

- **Local Data Collection**: This extension collects GitHub Copilot usage metrics and stores them locally on your machine
- **No Remote Transmission**: No data is transmitted over the internet or to any external servers
- **User Configuration**: You provide your name, team, and company information during configuration, which is stored locally
- **Workplace Usage**: If you're using this for team/company analytics, ensure you have appropriate permissions from your organization
- **Data Access**: Anyone with access to your machine can view the collected logs in the designated folder
- **Compliance**: You are responsible for ensuring your use of this extension complies with your organization's policies

**To stop data collection**: Simply disable or uninstall the extension from VS Code.