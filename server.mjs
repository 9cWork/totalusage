#!/usr/bin/env node
// Zero-dependency MCP stdio server: runs `ccusage` and returns the Total row by column.
import { execSync } from "node:child_process";
import { createInterface } from "node:readline";

const run = (cmd) =>
  execSync(cmd, {
    encoding: "utf8",
    env: { ...process.env, COLUMNS: "250", NO_COLOR: "1", FORCE_COLOR: "0" },
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });

function ensureCcusage() {
  try {
    run("ccusage --version");
  } catch {
    run("npm install -g ccusage@latest");
  }
}

const cells = (line) =>
  line.replace(/\x1b\[[0-9;]*m/g, "").split("│").slice(1).map((c) => c.trim());

function totalUsage() {
  ensureCcusage();
  const lines = run("ccusage").split(/\r?\n/);

  // Header = content rows between the top border (┌) and the first separator (├).
  const top = lines.findIndex((l) => l.includes("┌"));
  const sep = lines.findIndex((l, i) => i > top && l.includes("├"));
  const headerRows = lines.slice(top + 1, sep).map(cells);
  const headers = headerRows[0].map((_, i) =>
    headerRows.map((r) => r[i] || "").join(" ").replace(/\s+/g, " ").trim()
  );

  const totalLine = lines.find((l) => /^│\s*Total\s*│/.test(l.trim()));
  if (!totalLine) throw new Error("No Total row found in ccusage output");
  const values = cells(totalLine);

  const result = {};
  headers.forEach((h, i) => {
    if (i > 0 && values[i]) result[h] = values[i];
  });
  return result;
}

// ---- MCP plumbing ----
const TOOL = {
  name: "total_usage",
  description: "Run ccusage and return the Total row (Input, Output, Cache Create, Cache Read, Total Tokens, Cost).",
  inputSchema: { type: "object", properties: {} },
};
const PROMPT = { name: "totalusage", description: "Show total ccusage totals by category" };

const send = (msg) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");

function handle(req) {
  switch (req.method) {
    case "initialize":
      return {
        protocolVersion: req.params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: {}, prompts: {} },
        serverInfo: { name: "totalusage", version: "1.0.0" },
      };
    case "ping":
      return {};
    case "tools/list":
      return { tools: [TOOL] };
    case "tools/call": {
      if (req.params?.name !== TOOL.name) throw new Error(`Unknown tool: ${req.params?.name}`);
      try {
        const total = totalUsage();
        const text = Object.entries(total).map(([k, v]) => `${k}: ${v}`).join("\n");
        return { content: [{ type: "text", text }], structuredContent: total };
      } catch (e) {
        return { content: [{ type: "text", text: `ccusage failed: ${e.message}` }], isError: true };
      }
    }
    case "prompts/list":
      return { prompts: [PROMPT] };
    case "prompts/get":
      return {
        messages: [{
          role: "user",
          content: { type: "text", text: "Call the total_usage tool and show the result as a list of category: value, nothing else." },
        }],
      };
    default:
      throw Object.assign(new Error(`Method not found: ${req.method}`), { code: -32601 });
  }
}

createInterface({ input: process.stdin }).on("line", (line) => {
  if (!line.trim()) return;
  let req;
  try { req = JSON.parse(line); } catch { return; }
  if (req.id === undefined) return; // notification
  try {
    send({ id: req.id, result: handle(req) });
  } catch (e) {
    send({ id: req.id, error: { code: e.code ?? -32603, message: e.message } });
  }
});
