---
name: investigate
version: 1.0.0
description: |
  Systematic debugging with root cause investigation. Four phases: investigate,
  analyze, hypothesize, implement. Iron Law: no fixes without root cause.
  Use when asked to "debug this", "fix this bug", "why is this broken",
  "investigate this error", or "root cause analysis".
  Proactively suggest when the user reports errors, unexpected behavior, or
  is troubleshooting why something stopped working. If brute forcing starts,
  stop and research the docs, stack rules, and prior learnings before editing more code.
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - AskUserQuestion
hooks:
  PreToolUse:
    - matcher: "Edit"
      hooks:
        - type: command
          command: "bash ${CLAUDE_SKILL_DIR}/../freeze/bin/check-freeze.sh"
          statusMessage: "Checking debug scope boundary..."
    - matcher: "Write"
      hooks:
        - type: command
          command: "bash ${CLAUDE_SKILL_DIR}/../freeze/bin/check-freeze.sh"
          statusMessage: "Checking debug scope boundary..."
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
echo '{"skill":"investigate","ts":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","repo":"'$(basename "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || echo "unknown")'"}'  >> ~/.gstack/analytics/skill-usage.jsonl 2>/dev/null || true
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

# Systematic Debugging

## Iron Law

**NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST.**

Fixing symptoms creates whack-a-mole debugging. Every fix that doesn't address root cause makes the next bug harder to find. Find the root cause, then fix it.

---

## Phase 1: Root Cause Investigation

Gather context before forming any hypothesis.

1. **Collect symptoms:** Read the error messages, stack traces, and reproduction steps. If the user hasn't provided enough context, ask ONE question at a time via AskUserQuestion.

2. **Read the code:** Trace the code path from the symptom back to potential causes. Use Grep to find all references, Read to understand the logic.

3. **Read stack context:** If the project agent config dir (`$AGENT_DIR/stack.yaml`) exists, read it. Read the relevant files in `$AGENT_DIR/architecture/rules/`, recent memos in `$AGENT_DIR/research/`, and related notes in `$AGENT_DIR/compound/` before forming a fix. Bugs often repeat known architectural mistakes.

4. **Check recent changes:**
   ```bash
   git log --oneline -20 -- <affected-files>
   ```
   Was this working before? What changed? A regression means the root cause is in the diff.

5. **Check observability tools:** Scan `<available_skills>` for error tracking, APM, analytics, or data warehouse skills (e.g. sentry, newrelic, posthog, datadog, data warehouse). If any are available, read their SKILL.md and query them for recent errors, logs, or metrics matching the symptom. Production observability data often reveals the root cause faster than reading code.

6. **Reproduce:** Can you trigger the bug deterministically? If not, gather more evidence before proceeding.

7. **If framework behavior is unclear, research before editing:** Use local docs first, then `gstack-web-search` for official docs, changelogs, and issue threads. If the question is bigger than a quick search, recommend or run `/docs-research` before changing architecture-level behavior.

Output: **"Root cause hypothesis: ..."** — a specific, testable claim about what is wrong and why.

---

## Scope Lock

After forming your root cause hypothesis, lock edits to the affected module to prevent scope creep.

```bash
[ -x "${CLAUDE_SKILL_DIR}/../freeze/bin/check-freeze.sh" ] && echo "FREEZE_AVAILABLE" || echo "FREEZE_UNAVAILABLE"
```

**If FREEZE_AVAILABLE:** Identify the narrowest directory containing the affected files. Write it to the freeze state file:

```bash
STATE_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.gstack}"
mkdir -p "$STATE_DIR"
echo "<detected-directory>/" > "$STATE_DIR/freeze-dir.txt"
echo "Debug scope locked to: <detected-directory>/"
```

Substitute `<detected-directory>` with the actual directory path (e.g., `src/auth/`). Tell the user: "Edits restricted to `<dir>/` for this debug session. This prevents changes to unrelated code. Run `/unfreeze` to remove the restriction."

If the bug spans the entire repo or the scope is genuinely unclear, skip the lock and note why.

**If FREEZE_UNAVAILABLE:** Skip scope lock. Edits are unrestricted.

---

## Phase 2: Pattern Analysis

Check if this bug matches a known pattern:

| Pattern | Signature | Where to look |
|---------|-----------|---------------|
| Race condition | Intermittent, timing-dependent | Concurrent access to shared state |
| Nil/null propagation | NoMethodError, TypeError | Missing guards on optional values |
| State corruption | Inconsistent data, partial updates | Transactions, callbacks, hooks |
| Integration failure | Timeout, unexpected response | External API calls, service boundaries |
| Configuration drift | Works locally, fails in staging/prod | Env vars, feature flags, DB state |
| Stale cache | Shows old data, fixes on cache clear | Redis, CDN, browser cache, Turbo |

Also check:
- `TODOS.md` for related known issues
- `git log` for prior fixes in the same area — **recurring bugs in the same files are an architectural smell**, not a coincidence

---

## Phase 3: Hypothesis Testing

Before writing ANY fix, verify your hypothesis.

1. **Confirm the hypothesis:** Add a temporary log statement, assertion, or debug output at the suspected root cause. Run the reproduction. Does the evidence match?

2. **If the hypothesis is wrong:** Return to Phase 1. Gather more evidence. Do not guess.

3. **Brute-force circuit breaker:** If you have made 2 fix attempts or code changes without new evidence, STOP. Summarize what you know, say why the current theory is unproven, read the stack rules/research/compound notes again, and use `gstack-web-search` or `/docs-research` before changing more code.

4. **3-strike rule:** If 3 hypotheses fail, **STOP**. Use AskUserQuestion:
   ```
   3 hypotheses tested, none match. This may be an architectural issue
   rather than a simple bug.

   A) Continue investigating — I have a new hypothesis: [describe]
   B) Escalate for human review — this needs someone who knows the system
   C) Add logging and wait — instrument the area and catch it next time
   ```

**Red flags** — if you see any of these, slow down:
- "Quick fix for now" — there is no "for now." Fix it right or escalate.
- Proposing a fix before tracing data flow — you're guessing.
- Each fix reveals a new problem elsewhere — wrong layer, not wrong code.

---

## Phase 4: Implementation

Once root cause is confirmed:

1. **Fix the root cause, not the symptom.** The smallest change that eliminates the actual problem.

2. **Minimal diff:** Fewest files touched, fewest lines changed. Resist the urge to refactor adjacent code.

3. **Proof first:** For a reproducible bug, write the failing regression test before the final fix. If a failing automated test is impossible, create the smallest proof artifact you can: a deterministic repro, assertion, trace, or script that shows the bug exists.

4. **Write a regression test** that:
   - **Fails** without the fix (proves the test is meaningful)
   - **Passes** with the fix (proves the fix works)

5. **Run the full test suite.** Paste the output. No regressions allowed.

6. **If the fix touches >5 files:** Use AskUserQuestion to flag the blast radius:
   ```
   This fix touches N files. That's a large blast radius for a bug fix.
   A) Proceed — the root cause genuinely spans these files
   B) Split — fix the critical path now, defer the rest
   C) Rethink — maybe there's a more targeted approach
   ```

---

## Phase 5: Verification & Report

**Fresh verification:** Reproduce the original bug scenario and confirm it's fixed. This is not optional.

Run the test suite and paste the output.

Output a structured debug report:
```

Then answer these two questions explicitly:
1. **Human prevention:** What will help another engineer avoid this mistake next time — a test, rule file update, stronger abstraction, better error, or a doc change?
2. **Agent prevention:** What should change so the agent does not make the same mistake again — `/investigate`, `/review`, `/plan-eng-review`, `$AGENT_DIR/architecture/rules/`, `AGENTS.md` (or `CLAUDE.md`), or a new eval fixture?

If the lesson is durable, recommend `/compound` or write the incident note yourself if the user explicitly asked for learning capture.
DEBUG REPORT
════════════════════════════════════════
Symptom:         [what the user observed]
Root cause:      [what was actually wrong]
Fix:             [what was changed, with file:line references]
Evidence:        [test output, reproduction attempt showing fix works]
Regression test: [file:line of the new test]
Related:         [TODOS.md items, prior bugs in same area, architectural notes]
Status:          DONE | DONE_WITH_CONCERNS | BLOCKED
════════════════════════════════════════
```

---

## Important Rules

- **3+ failed fix attempts → STOP and question the architecture.** Wrong architecture, not failed hypothesis.
- **2 fix attempts without new evidence → STOP brute forcing and research.**
- **Never apply a fix you cannot verify.** If you can't reproduce and confirm, don't ship it.
- **Never say "this should fix it."** Verify and prove it. Run the tests.
- **For reproducible bugs, the default is failing test first.**
- **If fix touches >5 files → AskUserQuestion** about blast radius before proceeding.
- **Completion status:**
  - DONE — root cause found, fix applied, regression test written, all tests pass
  - DONE_WITH_CONCERNS — fixed but cannot fully verify (e.g., intermittent bug, requires staging)
  - BLOCKED — root cause unclear after investigation, escalated
