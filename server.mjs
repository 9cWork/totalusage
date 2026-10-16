#!/usr/bin/env node
// Zero-dependency MCP stdio server: runs `ccusage` and totals Claude-model usage by category.
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

const fmt = (n) => n.toLocaleString("en-US");

// Sums only Claude models (name starts with "claude-"), skipping other providers.
function totalUsage() {
  ensureCcusage();
  const data = JSON.parse(run("ccusage --json --breakdown"));
  const t = { input: 0, output: 0, cacheCreate: 0, cacheRead: 0, cost: 0 };
  for (const day of data.daily ?? []) {
    for (const m of day.modelBreakdowns ?? []) {
      if (!/^claude-/i.test(m.modelName)) continue;
      t.input += m.inputTokens;
      t.output += m.outputTokens;
      t.cacheCreate += m.cacheCreationTokens;
      t.cacheRead += m.cacheReadTokens;
      t.cost += m.cost;
    }
  }
  return {
    Input: fmt(t.input),
    Output: fmt(t.output),
    "Cache Create": fmt(t.cacheCreate),
    "Cache Read": fmt(t.cacheRead),
    "Total Tokens": fmt(t.input + t.output + t.cacheCreate + t.cacheRead),
    "Cost (USD)": "$" + t.cost.toFixed(2),
  };
}

// ---- MCP plumbing ----
const TOOL = {
  name: "total_usage",
  description: "Run ccusage and return Claude-only totals (Input, Output, Cache Create, Cache Read, Total Tokens, Cost).",
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
