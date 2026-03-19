---
name: compound
version: 1.1.0
description: |
  Capture engineering learnings from incidents, recurring patterns, and recent session
  history; promote them into durable guardrails and doctrine. Reads recent diffs, tests,
  research memos, project artifacts, session telemetry, and architecture rules; writes
  structured incident notes to .claude/compound/incidents/ and recurring-pattern notes to
  .claude/compound/patterns/; decides whether the lesson should become a regression test,
  rule-file update, DESIGN.md/architecture-doc update, CLAUDE.md rule, or skill/eval improvement.
  Use when a bug fix, review, investigation, or the last few sessions taught the team
  something worth remembering. Proactively suggest after painful debugging sessions,
  surprising regressions, repeated rework across sessions, or when the user's design or
  architecture philosophy appears to have shifted.
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
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
echo '{"skill":"compound","ts":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","repo":"'$(basename "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || echo "unknown")'"}'  >> ~/.gstack/analytics/skill-usage.jsonl 2>/dev/null || true
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

# /compound: Capture Incidents, Synthesize Patterns, Promote Doctrine

You are turning recent work into durable engineering learning. `/compound` is not just an incident diary. It should answer three questions:

1. **What concrete incident taught us something?**
2. **What recurring pattern showed up across the last N sessions?**
3. **What design, architecture, or workflow doctrine now seems true and should be written down in the project's source of truth?**

Never force everything into an incident. If the last several sessions reveal a stable new design or architecture philosophy, promote that doctrine even if nothing "failed."

## Phase 0: Choose the reflection window and build the timeline

Unless the user specifies otherwise, analyze the **last 8 work sessions or 21 days**, whichever gives more evidence. Use the same **45-minute gap** heuristic as `/retro` to detect sessions from commit history.

First, resolve the project slug and sanitized branch name you will use for project-scoped artifacts:

```bash
_GS=$([ -d "$HOME/.agents/skills/gstack" ] && echo "$HOME/.agents/skills/gstack" || echo "$HOME/.claude/skills/gstack")
source <("$_GS/bin/gstack-slug" 2>/dev/null)
echo "SLUG: $SLUG"
echo "BRANCH: $BRANCH"
```

Remember the `SLUG` and `BRANCH` values printed by that block. Use those values for all `~/.gstack/projects/$SLUG/...` and `.../$BRANCH-...` lookups below.

Build a recent-work timeline before writing any lesson. Read:
1. Current branch diff and recent commits.
2. Git history for the reflection window, grouped into sessions.
3. Proof artifacts: failing/passing tests, repro scripts, assertions, traces, screenshots, or QA evidence.
4. `~/.gstack/analytics/skill-usage.jsonl` for skill activation sequence during the same window.
5. `~/.gstack/projects/$SLUG/$BRANCH-reviews.jsonl` (if present) and other recent review/test artifacts in `~/.gstack/projects/$SLUG/`:
   - design docs
   - CEO plans
   - eng test plans
   - QA outcomes
   - design audits
6. the project agent config dir (`$AGENT_DIR/stack.yaml`) and the relevant files in `$AGENT_DIR/architecture/rules/`.
7. Relevant memos in `$AGENT_DIR/research/`.
8. Related notes in `$AGENT_DIR/compound/patterns/` and `incidents/`.
9. `AGENTS.md` (or `CLAUDE.md`), `DESIGN.md`, `ARCHITECTURE.md`, and `docs/architecture/stacks/` if they explain the area.
10. If contributor mode logs exist and they explain agent/tool friction relevant to the lesson, read `~/.gstack/contributor-logs/` too — but only as supporting evidence.

**Important:** telemetry is timeline metadata, not proof. Skill usage and review logs tell you *what happened when*; they do NOT by themselves prove the lesson.

## Phase 1: Classify the learning

Classify what you found into one or more of these buckets:

### A. Incident
A specific bug, regression, review finding, QA failure, or debugging outcome with concrete proof.

### B. Recurring pattern
Something that showed up across **2+ sessions**, **2+ incidents**, or repeated rework on the same area. Examples:
- repeated missing regression tests
- repeated late `/docs-research` on framework changes
- repeated empty-state / loading-state under-specification
- the same subsystem needing `/investigate` every week

### C. Doctrine shift
The user or team now seems to believe something new, and recent sessions keep reinforcing it. Examples:
- a new visual philosophy → update `DESIGN.md`
- a new implementation philosophy for a stack → update `$AGENT_DIR/architecture/rules/<stack>.md`
- a new architectural rationale → update `docs/architecture/stacks/<stack>.md` or `ARCHITECTURE.md`
- a new workflow rule → update `AGENTS.md` (or `CLAUDE.md`)

If none of these are supported by evidence, stop and say so. `/compound` captures learnings from evidence, not guesses.

## Phase 2: Write or update the incident note (when an incident exists)

If there is a concrete incident, create `$AGENT_DIR/compound/incidents/` if needed, then write a note to:

```bash
_AD=$([ -d ".agents" ] && echo ".agents" || echo ".claude")
mkdir -p "$_AD/compound/incidents"
DATE=$(date +%Y-%m-%d)
SLUG=$(printf '%s' "<incident-summary>" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | sed 's/^-//; s/-$//' | cut -c1-60)
echo "$_AD/compound/incidents/${DATE}-${SLUG}.md"
```

The note MUST contain:

```markdown
# <Title>

## Trigger
## Symptom
## What fooled us
## Root cause
## Proof
## Fix
## Human prevention
## Agent prevention
## Durable artifacts
## Promotion decision
## Applies when
```

### What each section means
- **Trigger:** what we were trying to do
- **Symptom:** what failed or looked wrong
- **What fooled us:** why this was easy to misunderstand or brute-force badly
- **Root cause:** the actual cause, not the visible symptom
- **Proof:** failing test, repro, assertion, trace, screenshot, or artifact that proved it
- **Fix:** the actual change that resolved it
- **Human prevention:** what would help another engineer avoid this mistake next time
- **Agent prevention:** what should change in prompts, skills, evals, or harness to stop the agent from repeating it
- **Durable artifacts:** concrete files/tests/docs/checks that should carry the lesson forward
- **Promotion decision:** where the lesson should be promoted now
- **Applies when:** stacks, paths, keywords, or situations where this heuristic matters

For incident capture, if you cannot identify the root cause and proof artifact, stop and say so.

## Phase 3: Write or update the pattern note (when a theme spans sessions)

If there is a recurring pattern OR a doctrine shift, create `$AGENT_DIR/compound/patterns/` if needed, then write or update the narrowest pattern note that captures the theme.

```bash
_AD=$([ -d ".agents" ] && echo ".agents" || echo ".claude")
mkdir -p "$_AD/compound/patterns"
SLUG=$(printf '%s' "<pattern-summary>" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | sed 's/^-//; s/-$//' | cut -c1-60)
echo "$_AD/compound/patterns/${SLUG}.md"
```

Pattern notes MUST contain:

```markdown
# Pattern: <Title>

## Signal
## Sessions observed
## Evidence
## Why it keeps happening
## Stable doctrine
## Promotion decision
## Applies when
```

### What each section means
- **Signal:** the recurring smell or repeated decision pattern
- **Sessions observed:** which recent sessions, branches, or artifacts support it
- **Evidence:** concrete examples — commits, QA outcomes, review findings, design docs, approved decisions, etc.
- **Why it keeps happening:** the real underlying driver (missing doctrine, weak tests, unclear plans, agent habit, product ambiguity)
- **Stable doctrine:** what now seems true enough to codify
- **Promotion decision:** where this should live now
- **Applies when:** stacks, paths, keywords, or situations where this pattern matters

Write or update a pattern note whenever a theme appears in **2+ sessions** or the project's doctrine has clearly shifted.

## Phase 4: Promotion rubric

Promote the lesson to the narrowest durable place that can actually prevent repetition:

1. **Executable guardrail first**
   - regression test
   - integration / contract / widget test
   - lint / static rule
   - CI check

2. **Design / architecture / workflow doctrine next**
   - `DESIGN.md` for visual and UX philosophy
   - `$AGENT_DIR/architecture/rules/<stack>.md` for short stack-specific implementation rules
   - `docs/architecture/stacks/<stack>.md` or `ARCHITECTURE.md` for rationale and longer architectural guidance
   - `AGENTS.md` (or `CLAUDE.md`) for short operational rules only

3. **Workflow changes only when broadly useful**
   - `/investigate`
   - `/review`
   - `/plan-eng-review`
   - `/plan-design-review`
   - eval fixtures / judges

4. **Keep it in `$AGENT_DIR/compound/patterns/` only** when the theme is real but not yet stable enough to become doctrine.

Use this checklist in the incident note or pattern note:

```markdown
### Promotion decision
- [ ] Add/update regression test
- [ ] Add/update lint or CI check
- [ ] Update DESIGN.md
- [ ] Update .claude/architecture/rules/<stack>.md
- [ ] Update docs/architecture/stacks/<stack>.md
- [ ] Update ARCHITECTURE.md
- [ ] Update CLAUDE.md
- [ ] Update a workflow skill or checklist
- [ ] Add a new eval or fixture
```

## Phase 5: Apply obvious promotions

If a promotion is factual, narrow, and low-risk, apply it directly:
- add a short rule to `$AGENT_DIR/architecture/rules/<stack>.md`
- append a concise note to `docs/architecture/stacks/<stack>.md`
- append a short operational rule to `AGENTS.md` (or `CLAUDE.md`)
- update `DESIGN.md` if the recent sessions clearly show an already-approved, already-shipped design philosophy that the doc has not caught up to yet

If the promotion is large, opinionated, or would rewrite existing doctrine, use AskUserQuestion before editing.

**Doctrine rule:** if recent sessions show a new design or architecture philosophy that is already reflected in approved plans, shipped code, or repeated user decisions, update the original source of truth. Do NOT bury it only in an incident note or pattern note.

## Phase 6: Report back

Tell the user:
1. how many sessions you analyzed and what window you used
2. where the incident note was written (if any)
3. where the pattern note was written or updated (if any)
4. what the top 3 learnings were
5. what doctrine or guardrails were promoted immediately
6. what still needs follow-up (tests, docs, skills, evals)

## Important Rules

- Do not reduce everything to incidents. Recurring patterns and doctrine shifts are valid `/compound` outputs.
- Do not write vague lessons like "be careful." Name the invariant, the proof, the repeated signal, and the durable prevention.
- For incidents, require a concrete proof artifact.
- For doctrine shifts, require repeated evidence across sessions, shipped changes, or approved plans — not a one-off vibe.
- Telemetry alone is never enough. Analytics and review logs support the timeline; they do not replace evidence.
- Prefer tests and harness changes over comments. Comments are last-mile explanation, not primary defense.
- If this was really a docs-research problem, say so and point to `/docs-research`.
- If the incident or doctrine contradicts an existing rule file, architecture doc, or design doc, update the contradiction or flag it explicitly.
