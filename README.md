## **Akvelon Copilot Insights for VS Code**

Fully **local** analytics for GitHub Copilot usage in Visual Studio Code.
Track completions and chat interactions **privately**, with **no telemetry** or data transmission outside the user’s machine.

---

### **Key Features**

* Local tracking of GitHub Copilot completions and chat activity
* Automatic background collection every 60 minutes
* Structured JSON metrics for usage reporting
* Configurable data storage location
* No external servers, no uploads, no dependency on network access

Designed for organizations requiring **strict privacy**, **compliance**, or **offline workflows**.

---

### **Demo**

![Akvelon Copilot Insights in action](assets/usage.gif)

*Collect and view Copilot usage analytics locally and securely.*

> The GIF shows: triggering log collection, automatic processing, and viewing JSON metrics in the designated folder.

---

### **Requirements**

* Visual Studio Code 1.104.0+
* GitHub Copilot extension installed
* Active Copilot subscription

---

### **Quick Start**

#### Initial Setup

1. Install the extension from the VS Code Marketplace
2. Open the Command Palette
   `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (macOS)
3. Run → **Akvelon Copilot: Configure User Settings**
4. Provide name, company, and team when prompted

#### Validate Installation

1. Trigger a manual collection
   `Ctrl+Shift+P → Akvelon Copilot: Collect Logs`
2. When the dialog opens, navigate to the logs folder
3. Confirm that metrics files are present

The extension will now operate in the background at regular intervals.

---

### **Data Storage**

Default folder location:

```
~/Desktop/{user}_{company}_{team}-vs_code_log_collector/
```

Example:

```
~/Desktop/John_Doe_Akvelon_Team1-vs_code_log_collector/
├── metrics/
│   └── metrics_2025-10-15.json
├── collection-state.json
├── parsing_state.json
└── user_config.json
```

For shared environments or multiple devices, configure a **custom storage directory** in VS Code settings.

---

### **Metrics Format Overview**

Example (`metrics_YYYY-MM-DD.json`):

```json
{
  "date": "2025-10-08",
  "source": "copilot",
  "action": "completion",
  "servedBy": "gpt-5",
  "numRequests": 3,
  "name": "John Doe",
  "team": "DevOps",
  "company": "Apple",
  "ide": "Visual Studio Code"
}
```

Tracked elements:

* Activity date
* Interaction type (completion or chat)
* Request count
* User/team/company identifiers from configuration
* IDE identifier

No workspace or source code is collected.

---

### **Settings (Optional)**

To change the output directory:

1. Open **Settings** → search: `Akvelon Copilot Insights`
2. Select a custom path
3. Reload the window: `Ctrl+Shift+P → Reload Window`

---

### **Troubleshooting**

| Issue              | Suggested Action                                  |
| ------------------ | ------------------------------------------------- |
| Logs not appearing | Ensure Copilot suggestions or chats are used      |
| Folder not created | Verify write permissions or set custom path       |
| Errors shown       | Check **View → Output → Akvelon Copilot Insights** |

Restarting or reinstalling the extension may resolve unresolved state issues.

---

### 🔒 **Data Privacy & Compliance**

This extension adheres to strict local-only data handling:

✅ Data collected: Copilot usage metadata only. 
❌ Data not collected: source code, credentials, personal content .
✅ Data storage: exclusively on the user’s machine .
❌ No network transmission or analytics services .
✅ Fully transparent, open-source implementation .

Organizational users are responsible for ensuring internal compliance with data retention policies.
To cease data collection → disable or uninstall the extension.

---

### **License**

MIT License — see `LICENSE` file for full details.