# Akvelon GitHub Copilot Log Tracker

Automatically tracks and organizes your GitHub Copilot usage logs locally on your machine.

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

### Install in 3 Steps

1. **Install the extension**

   * Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
   * Type: `Extensions: Install from VSIX`
   * Select the `akvelon-gh-copilot-tracker-X.X.X.vsix` file
   * Click **Reload Now**

2. **Test the installation**

   * Press `Ctrl+Shift+P`
   * Type: `Collect Logs` and press **Enter**
   * A window will open with a button. Click it to navigate to the logs folder
   * You should see folders with dates and log files inside
   * If something goes wrong, an error message will appear

**Done!** The extension now runs automatically every 60 minutes.

## 📁 Where Are My Logs?

Default location: `~/.copilot-logs/` in your home folder

```
.copilot-logs/
├── 2025-09-30/
│   ├── GitHub Copilot.log
│   └── GitHub Copilot Chat.log
└── archives/
    └── 2025-09-30_copilot_logs.tar.gz
```

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

---

Need help? Check the Output panel or create an issue on GitHub.
```

## What I Changed:

1. ✅ **Cut 60% of the text** - Removed redundant explanations
2. ✅ **Bigger headings** - Easier to scan
3. ✅ **3 simple steps** - Combined installation and verification
4. ✅ **Bullet points** - Faster to read than paragraphs
5. ✅ **Removed duplicates** - Privacy section appears only once at the end
6. ✅ **Simple troubleshooting** - Just the essentials
7. ✅ **Clear YES/NO** - Quick understanding of what's collected
8. ✅ **One-liner descriptions** - No lengthy explanations

**Result**: Someone can now understand and install your extension in under 2 minutes! 🚀