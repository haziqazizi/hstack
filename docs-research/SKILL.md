---
name: docs-research
version: 1.0.0
description: |
  Stack-aware documentation and web research. Reads repo docs first, then uses
  Context7 for library/framework docs and Exa web search for changelogs, issue threads,
  migrations, and disagreement checks. Writes a durable research memo to
  .claude/research/ for future plan reviews and bug fixes. Use when asked to
  research a library, evaluate a new tech stack, confirm framework best practices,
  or understand how something should work before coding.
  Proactively suggest when the user is introducing an unfamiliar dependency,
  changing framework behavior, or thrashing on a bug without solid evidence.
allowed-tools:
  - Bash
  - Read
  - Write
  - Grep
  - Glob
  - AskUserQuestion
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->

## Preamble (run first)

```bash
# Resolve gstack install directory (prefer .agents/, fallback .claude/)
_GS=$([ -d "$HOME/.agents/skills/gstack" ] && echo "$HOME/.agents/skills/gstack" || echo "$HOME/.claude/skills/gstack")
_GS_LOCAL=$([ -d ".agents/skills/gstack" ] && echo ".agents/skills/gstack" || echo ".claude/skills/gstack")
echo "GSTACK_DIR: $_GS"

# Resolve project agent config directory
_AD=$([ -d ".agents" ] && echo ".agents" || ([ -d ".claude" ] && echo ".claude" || echo ".agents"))
echo "AGENT_DIR: $_AD"

# Resolve context file
_CF=$([ -f "AGENTS.md" ] && echo "AGENTS.md" || ([ -f "CLAUDE.md" ] && echo "CLAUDE.md" || echo "AGENTS.md"))
echo "CONTEXT_FILE: $_CF"

_UPD=$("$_GS/bin/gstack-update-check" 2>/dev/null || "$_GS_LOCAL/bin/gstack-update-check" 2>/dev/null || true)
[ -n "$_UPD" ] && echo "$_UPD" || true
mkdir -p ~/.gstack/sessions
touch ~/.gstack/sessions/"$PPID"
_SESSIONS=$(find ~/.gstack/sessions -mmin -120 -type f 2>/dev/null | wc -l | tr -d ' ')
find ~/.gstack/sessions -mmin +120 -type f -delete 2>/dev/null || true
_CONTRIB=$("$_GS/bin/gstack-config" get gstack_contributor 2>/dev/null || true)
_PROACTIVE=$("$_GS/bin/gstack-config" get proactive 2>/dev/null || echo "true")
_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
echo "BRANCH: $_BRANCH"
echo "PROACTIVE: $_PROACTIVE"
_LAKE_SEEN=$([ -f ~/.gstack/.completeness-intro-seen ] && echo "yes" || echo "no")
echo "LAKE_INTRO: $_LAKE_SEEN"
_EXA=$("$_GS/bin/gstack-web-search" --check 2>/dev/null || "$_GS_LOCAL/bin/gstack-web-search" --check 2>/dev/null || echo "EXA_MISSING")
echo "EXA_SEARCH: $_EXA"
mkdir -p ~/.gstack/analytics
echo '{"skill":"docs-research","ts":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","repo":"'$(basename "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || echo "unknown")'"}'  >> ~/.gstack/analytics/skill-usage.jsonl 2>/dev/null || true
```

**Path conventions:** The preamble prints `GSTACK_DIR`, `AGENT_DIR`, and `CONTEXT_FILE`.
Use these throughout:
- **Gstack binaries:** Use the `GSTACK_DIR` path (e.g. `$GSTACK_DIR/bin/gstack-web-search`). In bash blocks, re-resolve with: `_GS=$([ -d "$HOME/.agents/skills/gstack" ] && echo "$HOME/.agents/skills/gstack" || echo "$HOME/.claude/skills/gstack")`
- **Project config:** Use `AGENT_DIR` (e.g. `$AGENT_DIR/stack.yaml`, `$AGENT_DIR/architecture/rules/`, `$AGENT_DIR/research/`, `$AGENT_DIR/compound/`). In bash blocks, re-resolve with: `_AD=$([ -d ".agents" ] && echo ".agents" || echo ".claude")`
- **Context file:** Use `CONTEXT_FILE` (either `AGENTS.md` or `CLAUDE.md`, whichever exists).

## User Skill Detection

Check `<available_skills>` for user-provided skills in these categories. **Prefer the user's own skills** over gstack built-ins when available:

- **Web search:** If the user has a web search skill (e.g. `native-web-search`, `x-research`), prefer it over `gstack-web-search`. Use the `web_search` or `read_web_page` tools directly if available.
- **Docs & research:** If the user has `context7`, `docs-research`, or similar skills, prefer those for library lookups and documentation.
- **Observability & debugging:** If the user has error tracking (`sentry-cli`), APM (`newrelic-inspector`), analytics (`posthog-cli`), or data warehouse skills, use them during `/investigate` and `/compound` workflows.
- **Browser: ALWAYS use gstack's /browse skill** with `agent-browser` (`$AB`). Never use user-provided browser skills (`web-browser`, `agent-browser` standalone, `mcp__claude-in-chrome__*`). The gstack browser has session isolation, cookie management, and ref system integration that other browser tools lack.

If `PROACTIVE` is `"false"`, do not proactively suggest gstack skills — only invoke
them when the user explicitly asks. The user opted out of proactive suggestions.

If output shows `UPGRADE_AVAILABLE <old> <new>`: read `$GSTACK_DIR/gstack-upgrade/SKILL.md` (using the `GSTACK_DIR` from the preamble) and follow the "Inline upgrade flow" (auto-upgrade if configured, otherwise AskUserQuestion with 4 options, write snooze state if declined). If `JUST_UPGRADED <from> <to>`: tell user "Running gstack v{to} (just updated!)" and continue.

If `LAKE_INTRO` is `no`: Before continuing, introduce the Completeness Principle.
Tell the user: "gstack follows the **Boil the Lake** principle — always do the complete
thing when AI makes the marginal cost near-zero. Read more: https://garryslist.org/posts/boil-the-ocean"
Then offer to open the essay in their default browser:

```bash
open https://garryslist.org/posts/boil-the-ocean
touch ~/.gstack/.completeness-intro-seen
```

Only run `open` if the user says yes. Always run `touch` to mark as seen. This only happens once.

## AskUserQuestion Format

**ALWAYS follow this structure for every AskUserQuestion call:**
1. **Re-ground:** State the project, the current branch (use the `_BRANCH` value printed by the preamble — NOT any branch from conversation history or gitStatus), and the current plan/task. (1-2 sentences)
2. **Simplify:** Explain the problem in plain English a smart 16-year-old could follow. No raw function names, no internal jargon, no implementation details. Use concrete examples and analogies. Say what it DOES, not what it's called.
3. **Recommend:** `RECOMMENDATION: Choose [X] because [one-line reason]` — always prefer the complete option over shortcuts (see Completeness Principle). Include `Completeness: X/10` for each option. Calibration: 10 = complete implementation (all edge cases, full coverage), 7 = covers happy path but skips some edges, 3 = shortcut that defers significant work. If both options are 8+, pick the higher; if one is ≤5, flag it.
4. **Options:** Lettered options: `A) ... B) ... C) ...` — when an option involves effort, show both scales: `(human: ~X / CC: ~Y)`

Assume the user hasn't looked at this window in 20 minutes and doesn't have the code open. If you'd need to read the source to understand your own explanation, it's too complex.

Per-skill instructions may add additional formatting rules on top of this baseline.

## Completeness Principle — Boil the Lake

AI-assisted coding makes the marginal cost of completeness near-zero. When you present options:

- If Option A is the complete implementation (full parity, all edge cases, 100% coverage) and Option B is a shortcut that saves modest effort — **always recommend A**. The delta between 80 lines and 150 lines is meaningless with CC+gstack. "Good enough" is the wrong instinct when "complete" costs minutes more.
- **Lake vs. ocean:** A "lake" is boilable — 100% test coverage for a module, full feature implementation, handling all edge cases, complete error paths. An "ocean" is not — rewriting an entire system from scratch, adding features to dependencies you don't control, multi-quarter platform migrations. Recommend boiling lakes. Flag oceans as out of scope.
- **When estimating effort**, always show both scales: human team time and CC+gstack time. The compression ratio varies by task type — use this reference:

| Task type | Human team | CC+gstack | Compression |
|-----------|-----------|-----------|-------------|
| Boilerplate / scaffolding | 2 days | 15 min | ~100x |
| Test writing | 1 day | 15 min | ~50x |
| Feature implementation | 1 week | 30 min | ~30x |
| Bug fix + regression test | 4 hours | 15 min | ~20x |
| Architecture / design | 2 days | 4 hours | ~5x |
| Research / exploration | 1 day | 3 hours | ~3x |

- This principle applies to test coverage, error handling, documentation, edge cases, and feature completeness. Don't skip the last 10% to "save time" — with AI, that 10% costs seconds.

**Anti-patterns — DON'T do this:**
- BAD: "Choose B — it covers 90% of the value with less code." (If A is only 70 lines more, choose A.)
- BAD: "We can skip edge case handling to save time." (Edge case handling costs minutes with CC.)
- BAD: "Let's defer test coverage to a follow-up PR." (Tests are the cheapest lake to boil.)
- BAD: Quoting only human-team effort: "This would take 2 weeks." (Say: "2 weeks human / ~1 hour CC.")

## Contributor Mode

If `_CONTRIB` is `true`: you are in **contributor mode**. You're a gstack user who also helps make it better.

**At the end of each major workflow step** (not after every single command), reflect on the gstack tooling you used. Rate your experience 0 to 10. If it wasn't a 10, think about why. If there is an obvious, actionable bug OR an insightful, interesting thing that could have been done better by gstack code or skill markdown — file a field report. Maybe our contributor will help make us better!

**Calibration — this is the bar:** For example, `$AB eval 'await fetch(...)'` fails with `SyntaxError: await is only valid in async functions` because agent-browser doesn't wrap expressions in async context. Small, but the input was reasonable and gstack should have documented the right `eval --stdin` pattern — that's the kind of thing worth filing. Things less consequential than this, ignore.

**NOT worth filing:** user's app bugs, network errors to user's URL, auth failures on user's site, user's own JS logic bugs.

**To file:** write `~/.gstack/contributor-logs/{slug}.md` with **all sections below** (do not truncate — include every section through the Date/Version footer):

```
# {Title}

Hey gstack team — ran into this while using /{skill-name}:

**What I was trying to do:** {what the user/agent was attempting}
**What happened instead:** {what actually happened}
**My rating:** {0-10} — {one sentence on why it wasn't a 10}

## Steps to reproduce
1. {step}

## Raw output
```
{paste the actual error or unexpected output here}
```

## What would make this a 10
{one sentence: what gstack should have done differently}

**Date:** {YYYY-MM-DD} | **Version:** {gstack version} | **Skill:** /{skill}
```

Slug: lowercase, hyphens, max 60 chars (e.g. `browse-js-no-await`). Skip if file already exists. Max 3 reports per session. File inline and continue — don't stop the workflow. Tell user: "Filed gstack field report: {title}"

## Completion Status Protocol

When completing a skill workflow, report status using one of:
- **DONE** — All steps completed successfully. Evidence provided for each claim.
- **DONE_WITH_CONCERNS** — Completed, but with issues the user should know about. List each concern.
- **BLOCKED** — Cannot proceed. State what is blocking and what was tried.
- **NEEDS_CONTEXT** — Missing information required to continue. State exactly what you need.

### Escalation

It is always OK to stop and say "this is too hard for me" or "I'm not confident in this result."

Bad work is worse than no work. You will not be penalized for escalating.
- If you have attempted a task 3 times without success, STOP and escalate.
- If you are uncertain about a security-sensitive change, STOP and escalate.
- If the scope of work exceeds what you can verify, STOP and escalate.

Escalation format:
```
STATUS: BLOCKED | NEEDS_CONTEXT
REASON: [1-2 sentences]
ATTEMPTED: [what you tried]
RECOMMENDATION: [what the user should do next]
```

## Web Search

**Priority order for web search:**
1. **Native tools first:** If you have `web_search` or `read_web_page` tools available (provided by pi, Claude Code, or other harnesses), use those directly — they require no setup.
2. **User skills:** If `<available_skills>` lists a web search skill (e.g. `native-web-search`, `x-research`), read and use it.
3. **gstack Exa fallback:** If the preamble printed `EXA_SEARCH: EXA_READY`, use the gstack CLI:

```bash
_GS=$([ -d "$HOME/.agents/skills/gstack" ] && echo "$HOME/.agents/skills/gstack" || echo "$HOME/.claude/skills/gstack")
"$_GS/bin/gstack-web-search" "your search query"
"$_GS/bin/gstack-web-search" "your query" --results 10
"$_GS/bin/gstack-web-search" "your query" --contents          # include full page text
"$_GS/bin/gstack-web-search" "your query" --category news     # filter: company, research paper, news, pdf, github, tweet, personal site
"$_GS/bin/gstack-web-search" "your query" --domain github.com # restrict to domain
```

**Read a specific URL:**
```bash
_GS=$([ -d "$HOME/.agents/skills/gstack" ] && echo "$HOME/.agents/skills/gstack" || echo "$HOME/.claude/skills/gstack")
"$_GS/bin/gstack-read-url" "https://example.com/page"
"$_GS/bin/gstack-read-url" "https://example.com/page" --max-chars 20000
```

If none of the above are available, tell the user:
"Web search is not available — either use an agent harness with built-in web search (pi, Claude Code) or add an Exa API key: `echo 'EXA_API_KEY=your-key' >> ~/.gstack/.env`"
Then continue without web search — use local docs and Context7 only.

# /docs-research: Local Context → Context7 → Web Research

You are a staff engineer doing research before code changes. Your output is a durable research memo, not implementation.

## Phase 1: Gather local context first

1. Read `AGENTS.md` (or `CLAUDE.md`), `ARCHITECTURE.md`, and `docs/architecture/` if they exist.
2. Read the project agent config dir (`$AGENT_DIR/stack.yaml`) if it exists.
3. Read relevant files in `$AGENT_DIR/architecture/rules/`.
4. Read the most recent relevant memo in `$AGENT_DIR/research/` and the most relevant pattern notes in `$AGENT_DIR/compound/patterns/`.
5. If the user did not specify a clear research question, ask ONE AskUserQuestion to clarify the exact decision they need to make.

## Phase 2: Detect the stack and likely libraries

Run:

```bash
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
"$_GS/bin/gstack-stack-detect" --project-root "$PROJECT_ROOT" --json 2>/dev/null || "$_GS_LOCAL/bin/gstack-stack-detect" --project-root "$PROJECT_ROOT" --json 2>/dev/null || true
```

Use the output plus local config files (`package.json`, `Gemfile`, `pyproject.toml`, `pubspec.yaml`, etc.) to identify which frameworks/libraries matter for this question.

## Phase 3: Context7 research

Prefer official or canonical docs first.

1. If `mcporter` is available, resolve each relevant library/framework:
   ```bash
   mcporter call context7.resolve-library-id query="<what you need>" libraryName="<library>"
   ```
2. Query the top match with a specific question:
   ```bash
   mcporter call context7.query-docs libraryId="<resolved-id>" query="<specific question>"
   ```
3. Do not call Context7 more than 3 times per research question unless the first results were clearly irrelevant.
4. If `mcporter` is unavailable, note it in the memo and continue with web search. Tell the user to rerun `./setup` later so Context7 is available next time.

## Phase 4: Web research

Use `gstack-web-search` for information Context7 will not reliably cover:
- recent release notes and breaking changes
- migration guides
- issue threads / maintainer comments
- blog posts describing failure modes in production
- disagreement checks when docs and local conventions differ

```bash
# Search for relevant information
"$_GS/bin/gstack-web-search" "your specific query" --results 10

# Read a specific page for deeper context
"$_GS/bin/gstack-read-url" "https://relevant-url.com/page"

# Search within a specific domain
"$_GS/bin/gstack-web-search" "query" --domain github.com

# Get full page contents in search results
"$_GS/bin/gstack-web-search" "query" --contents
```

When you search:
1. Search with a purpose, not a vague keyword dump.
2. Prefer canonical docs/changelogs/issues over random SEO content.
3. Include full source URLs in the memo.
4. If sources disagree, say so explicitly.

## Phase 5: Produce a durable memo

Create `$AGENT_DIR/research/` if needed, then write a memo to:

```bash
_AD=$([ -d ".agents" ] && echo ".agents" || echo ".claude")
mkdir -p "$_AD/research"
DATE=$(date +%Y-%m-%d)
SLUG=$(printf '%s' "<topic-summary>" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | sed 's/^-//; s/-$//' | cut -c1-50)
echo "$_AD/research/${DATE}-${SLUG}.md"
```

The memo MUST contain:

```markdown
# <Title>

## Question
## Repo context
## Current / proposed stack
## Local patterns already in use
## Context7 findings
## Web findings
## Recommended approach
## Risks / incompatibilities
## Candidate architectural rules
## Candidate tests / evals
## Sources
```

The memo should answer: what should we do, why, what could go wrong, and what rule or test should change so this goes more smoothly next time.

## Phase 6: Close the loop

After writing the memo:
1. Tell the user where the memo was written.
2. Summarize the recommendation in 3-6 bullets.
3. If the research implies a durable rule change, say exactly which file should be updated next:
   - `$AGENT_DIR/architecture/rules/<stack>.md`
   - `docs/architecture/stacks/<stack>.md`
   - `AGENTS.md` (or `CLAUDE.md`)
   - `/plan-eng-review` or `/review`
4. If the research belongs in a learning note after the work lands, recommend `/compound`.

## Important Rules

- Local code and docs beat generic best practices when they are clearly intentional.
- Official docs beat blog posts; production postmortems beat marketing copy.
- Research before code. If you're still guessing after local docs + Context7 + web search, say what remains uncertain.
- Do not implement code in this skill. Produce the memo and the recommendation.
