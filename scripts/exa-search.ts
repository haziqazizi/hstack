#!/usr/bin/env bun
/**
 * Exa web search CLI for gstack skills.
 *
 * Commands:
 *   search "query" [--results N] [--contents] [--category X] [--domain X]
 *   read   "url"   [--max-chars N]
 *   check          — exits 0 if EXA_API_KEY configured, 1 if not
 *
 * Reads EXA_API_KEY from ~/.gstack/.env or environment.
 */

import * as fs from 'fs';
import * as path from 'path';

const EXA_BASE = 'https://api.exa.ai';
const ENV_PATH = path.join(process.env.HOME || '~', '.gstack', '.env');

// ─── Env Loading ────────────────────────────────────────────

function loadEnvFile(): void {
  try {
    const content = fs.readFileSync(ENV_PATH, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // No .env file — that's fine, key might be in environment
  }
}

function getApiKey(): string | null {
  loadEnvFile();
  return process.env.EXA_API_KEY || null;
}

// ─── Arg Parsing ────────────────────────────────────────────

interface SearchArgs {
  query: string;
  numResults: number;
  includeContents: boolean;
  category?: string;
  domain?: string;
}

interface ReadArgs {
  url: string;
  maxChars: number;
}

function parseSearchArgs(argv: string[]): SearchArgs {
  const args: SearchArgs = { query: '', numResults: 5, includeContents: false };
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === '--results' && argv[i + 1]) {
      args.numResults = Math.min(parseInt(argv[++i], 10) || 5, 20);
    } else if (arg === '--contents') {
      args.includeContents = true;
    } else if (arg === '--category' && argv[i + 1]) {
      args.category = argv[++i];
    } else if (arg === '--domain' && argv[i + 1]) {
      args.domain = argv[++i];
    } else if (!arg.startsWith('--') && !args.query) {
      args.query = arg;
    }
    i++;
  }
  return args;
}

function parseReadArgs(argv: string[]): ReadArgs {
  const args: ReadArgs = { url: '', maxChars: 10000 };
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === '--max-chars' && argv[i + 1]) {
      args.maxChars = parseInt(argv[++i], 10) || 10000;
    } else if (!arg.startsWith('--') && !args.url) {
      args.url = arg;
    }
    i++;
  }
  return args;
}

// ─── Commands ───────────────────────────────────────────────

async function cmdCheck(): Promise<void> {
  const key = getApiKey();
  if (key) {
    console.log('EXA_READY');
    process.exit(0);
  } else {
    console.log('EXA_MISSING');
    process.exit(1);
  }
}

async function cmdSearch(argv: string[]): Promise<void> {
  const key = getApiKey();
  if (!key) {
    console.error('EXA_API_KEY not configured. Run gstack setup to add it.');
    process.exit(1);
  }

  const args = parseSearchArgs(argv);
  if (!args.query) {
    console.error('Usage: exa-search.ts search "query" [--results N] [--contents] [--category X] [--domain X]');
    process.exit(1);
  }

  const body: Record<string, unknown> = {
    query: args.query,
    type: 'auto',
    numResults: args.numResults,
  };

  if (args.category) body.category = args.category;
  if (args.domain) body.includeDomains = [args.domain];
  if (args.includeContents) {
    body.contents = { text: { maxCharacters: 8000 } };
  }

  const res = await fetch(`${EXA_BASE}/search`, {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error(`Exa search failed (${res.status}): ${detail}`);
    process.exit(1);
  }

  const data = (await res.json()) as { results?: Array<Record<string, unknown>> };
  const results = data.results ?? [];

  if (results.length === 0) {
    console.log('No results found.');
    process.exit(0);
  }

  const lines: string[] = [`Found ${results.length} result(s):\n`];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    lines.push(`${i + 1}. ${r.title ?? '(no title)'}`);
    lines.push(`   ${r.url}`);
    if (r.publishedDate) lines.push(`   Published: ${r.publishedDate}`);
    if (r.author) lines.push(`   Author: ${r.author}`);
    if (args.includeContents && typeof r.text === 'string') {
      lines.push('   ---');
      for (const line of (r.text as string).trim().split('\n')) {
        lines.push(`   ${line}`);
      }
    }
    lines.push('');
  }

  console.log(lines.join('\n'));
}

async function cmdRead(argv: string[]): Promise<void> {
  const key = getApiKey();
  if (!key) {
    console.error('EXA_API_KEY not configured. Run gstack setup to add it.');
    process.exit(1);
  }

  const args = parseReadArgs(argv);
  if (!args.url) {
    console.error('Usage: exa-search.ts read "url" [--max-chars N]');
    process.exit(1);
  }

  const body = {
    urls: [args.url],
    text: { maxCharacters: args.maxChars },
    livecrawl: 'preferred',
  };

  const res = await fetch(`${EXA_BASE}/contents`, {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error(`Exa fetch failed (${res.status}): ${detail}`);
    process.exit(1);
  }

  const data = (await res.json()) as {
    results?: Array<Record<string, unknown>>;
    statuses?: Array<{ status: string; error?: { tag?: string; httpStatusCode?: number } }>;
  };

  const errStatus = (data.statuses ?? []).find((s) => s.status === 'error');
  if (errStatus) {
    console.error(
      `Failed to fetch ${args.url}: ${errStatus.error?.tag ?? 'unknown'} (${errStatus.error?.httpStatusCode ?? '?'})`
    );
    process.exit(1);
  }

  const results = data.results ?? [];
  if (results.length === 0) {
    console.error(`No content returned for ${args.url}`);
    process.exit(1);
  }

  const r = results[0];
  const lines: string[] = [];
  if (r.title) lines.push(`# ${r.title}\n`);
  lines.push(`Source: ${r.url ?? args.url}\n`);
  if (r.publishedDate) lines.push(`Published: ${r.publishedDate}\n`);
  if (r.author) lines.push(`Author: ${r.author}\n`);
  lines.push('---\n');
  if (typeof r.text === 'string') lines.push((r.text as string).trim());
  else lines.push('(no text content returned)');

  console.log(lines.join('\n'));
}

// ─── Main ───────────────────────────────────────────────────

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case 'check':
    await cmdCheck();
    break;
  case 'search':
    await cmdSearch(rest);
    break;
  case 'read':
    await cmdRead(rest);
    break;
  default:
    console.error(`Usage: exa-search.ts <check|search|read> [args]

Commands:
  check                              Check if EXA_API_KEY is configured
  search "query" [options]           Search the web via Exa
  read   "url"   [--max-chars N]     Fetch and read a URL via Exa

Search options:
  --results N      Number of results (default: 5, max: 20)
  --contents       Include full page text in results
  --category X     Filter: company, research paper, news, pdf, github, tweet, personal site
  --domain X       Restrict to domain, e.g. github.com`);
    process.exit(1);
}
