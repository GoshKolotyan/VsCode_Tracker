const fs = require("fs")
const path = require("path")

class CopilotParser {
    constructor() {
        this.COPILOT_RE = /^(?<date>\d{4}-\d{2}-\d{2}).* at <?(?<served_by>https:\/\/[^ >]+)>? finished with 200 status after (?<duration>[0-9.]+)ms/;
    }

    /**
     * Parse log files and collect CopilotLogEntry objects.
     */
    parse(logFiles, ifChat, userName = "Unknown", company = "Unknown", team = "Unknown") {
        const records = [];

        for (const logFile of logFiles){
            try {
                const content = fs.readFileSync(logFile, {encoding:'utf-8', flag:'r'});
                const lines = content.split("\n");

                for (const line of lines) {
                    let result;
                    if (ifChat) {
                        result = this.parseChatLine(line, userName, company, team);
                    } else {
                        result = this.parseCopilotLine(line, userName, company, team);
                    }
                    if (result) {
                        records.push(result);
                    }
                }
            } catch (e) {
                console.log(`Error reading file ${logFile}: ${e.message}`);
                continue
            }
        }
        return records
    }
    /**
     * Parse a single Copilot completion log line.
     *
     * Example:
     * 2025-09-04 23:02:52.279 [info] [fetchCompletions] Request ... at https://proxy.business.githubcopilot.com/v1/engines/gpt-41-copilot/completions finished with 200 status after 227.30137500003912ms
     */
    parseCopilotLine(line, userName = "Unknown", company = "Unknown", team = "Unknown"){
        const match = this.COPILOT_RE.exec(line);
        if (!match) {
            return null
        }
        try {
            return {
                date: match.groups.date,
                source: 'copilot',
                served_by: match.groups.served_by,
                action: "completion",
                response_time: parseFloat(match.groups.duration),
                name: userName,
                company: company,
                team: team
            }
        } catch (e) {
            console.log(`Error creating CopilotLogEntry: ${e.message}`)
            return null
        }
    }
    /**
     * Parse a single Copilot Chat log line.
     *
     * Example:
     * 2025-09-03 16:41:26.178 [info] ccreq:ab70e0b0.copilotmd | success | gpt-4.1 | 7006ms | [panel/unknown]
     */
    parseChatLine(line, userName = "Unknown", company = "Unknown", team = "Unknown"){
        if (!line.includes("copilotmd | success")) {
            return null
        }

        const matchDate = /^(\d{4}-\d{2}-\d{2})/.exec(line);
        if (!matchDate){
            return null
        }
        const date = matchDate[1];

        const parts = line.split("|").map(p => p.trim());
        const idx = parts.indexOf("success");

        if (idx === -1) {
            return null;
        }

        if (idx + 3 >= parts.length) {
            return null;
        }
       // Next tokens: served_by, response_time, action
        const servedBy = parts[idx + 1];
        const responseTime = parts[idx + 2];
        const action = parts[idx + 3];

        // Clean response_time from "ms"
        const matchTime = /(\d+)/.exec(responseTime);

        if (!matchTime) {
            return null;
        }
        try {
            return {
                date: date,
                source: "copilot-chat",
                served_by: servedBy,
                action: action,
                response_time: parseFloat(matchTime[1]),
                name: userName,
                company: company,
                team: team
            };
        } catch (e) {
            console.log(`Error creating CopilotLogEntry: ${e.message}`);
            return null;
        }

    }
    /**
     * Group records by date, source, served_by and action
     */
    static aggregate(records){
        const totals = {};
        for (const rec of records) {
            const key = `${rec.date}|${rec.source}|${rec.served_by}|${rec.action}`;
            if (!totals[key]) {
                totals[key] = {
                    numRequests: 0,
                    name: "",
                    company: "",
                    team: "",
                    date: rec.date,
                    source: rec.source,
                    servedBy: rec.served_by,
                    action: rec.action
                };
            }
            totals[key].numRequests += 1;
            totals[key].name = rec.name;
            totals[key].company = rec.company;
            totals[key].team = rec.team;
        }
        const grouped = {};

        for (const [key, value] of Object.entries(totals)) {
            grouped[key] = {
                date: value.date,
                source: value.source,
                servedBy: value.servedBy,
                action: value.action,
                numRequests: value.numRequests,
                name: value.name,
                team: value.team,
                company: value.company,
                ide: "Visual Studio Code"
            };
        }
        return grouped;
    }
}

module.exports = CopilotParser;