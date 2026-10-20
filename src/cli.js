#!/usr/bin/env node
// grok-search CLI — one-shot Grok search / deep research / fact-check.
// Reuses the MCP server core (fixed model routing, retry, streaming, proxy env).

import {
  askGrokWithRetry,
  config,
  SEARCH_MODEL,
  DEEP_SEARCH_MODEL,
  FACTCHECK_MODEL,
  SEARCH_EFFORT,
  DEEP_SEARCH_EFFORT,
  FACTCHECK_EFFORT
} from "./server.js";

const FAST_MAX_ATTEMPTS = 5;
const DEEP_MAX_ATTEMPTS = 5;
const DEFAULT_MAX_RESULTS = 20;

const USAGE = `grok-search — web search, deep research, and fact-checking via Grok

Usage:
  grok-search "query"                 Quick web search (grok-chat-fast, effort=auto)
  grok-search --deep "query"          Deep multi-agent research (effort=xhigh, slower)
  grok-search --factcheck "claim"     Fact-check a claim (verdict + evidence + sources)

Options:
  --max-results N    Preferred number of source links (default ${DEFAULT_MAX_RESULTS}, max 25)
  -h, --help         Show this help

Environment:
  Reads ~/.config/grok-search/env (override with GROK_SEARCH_ENV).
  Required: GROK_API_KEY. Optional: GROK_BASE_URL, GROK_TIMEOUT_MS,
  GROK_DEEP_TIMEOUT_MS, GROK_STREAM, HTTPS_PROXY/HTTP_PROXY/ALL_PROXY.
`;

function parseArgs(argv) {
  let task = "search";
  let maxResults = DEFAULT_MAX_RESULTS;
  const words = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--deep" || arg === "--deep-search") {
      task = "deep_search";
    } else if (arg === "--factcheck" || arg === "--fact-check") {
      task = "fact_check";
    } else if (arg === "--max-results") {
      const value = Number.parseInt(argv[++i] ?? "", 10);
      if (!Number.isFinite(value) || value < 1 || value > 25) {
        throw new UsageError("--max-results must be an integer between 1 and 25");
      }
      maxResults = value;
    } else if (arg === "-h" || arg === "--help") {
      process.stdout.write(USAGE);
      process.exit(0);
    } else if (arg.startsWith("--")) {
      throw new UsageError(`unknown option: ${arg}`);
    } else {
      words.push(arg);
    }
  }

  const text = words.join(" ").trim();
  if (text === "") {
    throw new UsageError("missing query");
  }
  return { task, maxResults, text };
}

class UsageError extends Error {}

function paramsFor({ task, maxResults, text }) {
  if (task === "deep_search") {
    return {
      task,
      userText: text,
      maxResults,
      model: DEEP_SEARCH_MODEL,
      effort: DEEP_SEARCH_EFFORT,
      timeoutMs: config.deepTimeoutMs,
      maxAttempts: DEEP_MAX_ATTEMPTS
    };
  }
  return {
    task,
    userText: text,
    maxResults,
    model: task === "fact_check" ? FACTCHECK_MODEL : SEARCH_MODEL,
    effort: task === "fact_check" ? FACTCHECK_EFFORT : SEARCH_EFFORT,
    timeoutMs: config.timeoutMs,
    maxAttempts: FAST_MAX_ATTEMPTS
  };
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`grok-search: ${error.message}\n\n${USAGE}`);
    process.exit(2);
  }

  const text = await askGrokWithRetry(paramsFor(parsed));
  process.stdout.write(`${text}\n`);
}

main().catch((error) => {
  process.stderr.write(`grok-search: ${error?.message ?? error}\n`);
  process.exit(1);
});
