# Browser Reference

This document covers the **current** `/browse` stack in gstack.

The old in-repo `browse/src` runtime is gone. gstack now drives an external
[`agent-browser`](https://www.npmjs.com/package/agent-browser) install through a
session-scoped shell alias:

```bash
AB="agent-browser --session gstack-$PPID"
```

That means the browser process is still persistent across commands, but gstack no
longer ships or documents its own compiled browser binary.

## How `/browse` works now

1. `./setup` verifies that `agent-browser` is installed and runnable.
2. Each skill session creates a unique browser session name: `gstack-$PPID`.
3. The first `$AB ...` call starts the browser.
4. Later calls reuse the same session, so cookies, tabs, and localStorage persist.
5. When the skill needs authenticated pages, `gstack-cookie-import` loads cookies
   from your local Chromium profile into the active `agent-browser` session.

Typical latency is still roughly:
- first call: ~3s
- later calls: ~100–200ms

## Core command patterns

gstack documents and relies on these `agent-browser` command families.

### Navigation

| Command | What it does |
|---|---|
| `open <url>` | Navigate to a URL. `goto` and `navigate` are aliases. |
| `back` | Go back in history. |
| `forward` | Go forward in history. |
| `reload` | Reload the page. |
| `get url` | Print the current URL. |

### Reading

| Command | What it does |
|---|---|
| `get text body` | Read visible page text. |
| `get html <sel>` | Return inner HTML for a selector or ref. |
| `snapshot [-i] [-c] [-d N] [-s sel] [-C]` | Accessibility tree with refs. |
| `console` | Show console output. |
| `errors` | Show console warnings/errors only. |
| `network requests` | Show captured network requests. |
| `cookies` | Show current cookies. |
| `storage local` | Show localStorage. |

### Interaction

| Command | What it does |
|---|---|
| `click <sel>` | Click an element or `@ref`. |
| `fill <sel> <text>` | Clear and fill an input. |
| `type <sel> <text>` | Type without clearing first. |
| `select <sel> <value>` | Select a dropdown option. |
| `hover <sel>` | Hover an element. |
| `press <key>` | Press a key like Enter, Tab, or Escape. |
| `scroll <dir> [px]` | Scroll up/down/left/right. |
| `wait <sel\|ms>` | Wait for an element or a duration. |
| `upload <sel> <file...>` | Upload one or more files. |
| `dialog accept [text]` | Accept the next dialog. |
| `dialog dismiss` | Dismiss the next dialog. |

### Inspection & visuals

| Command | What it does |
|---|---|
| `eval <js>` | Run JavaScript. Use `eval --stdin` for multiline or `await`. |
| `get attr <sel> <name>` | Read an attribute. |
| `get styles <sel>` | Read computed styles. |
| `is <state> <sel>` | Check `visible`, `enabled`, or `checked`. |
| `screenshot [path]` | Save a screenshot. |
| `screenshot --annotate [path]` | Save an annotated screenshot with numbered refs. |
| `pdf <path>` | Save the page as PDF. |
| `set viewport <w> <h>` | Set viewport size. |
| `set device <name>` | Apply a device preset. |

### Tabs & state

| Command | What it does |
|---|---|
| `tab` | List tabs. |
| `tab <n>` | Switch tabs. |
| `tab new [url]` | Open a new tab. |
| `tab close [n]` | Close a tab. |
| `state save <path>` | Save cookies/storage to a file. |
| `state load <path>` | Load saved browser state. |
| `close` | Close the browser session. |

## Snapshot workflow

`snapshot` is still the main way the skills understand the page.

Useful flags:

```text
-i        --interactive            Interactive elements only
-c        --compact                Compact output
-d <N>    --depth <N>              Limit tree depth
-s <sel>  --scope <sel>            Scope to a selector
-C        --cursor-interactive     Include cursor:pointer / non-ARIA targets
```

Example:

```bash
$AB snapshot -i -C
$AB click @e3
$AB fill @e4 "hello"
```

Refs are invalidated after navigation or major page changes. When in doubt, run
`snapshot` again.

### Diffing page state

The old built-in snapshot diff mode is gone. Use a shell diff shim instead:

```bash
$AB snapshot -i > .gstack/snap-$PPID-before.txt
# ...do the action...
$AB snapshot -i > .gstack/snap-$PPID-after.txt
diff -u .gstack/snap-$PPID-before.txt .gstack/snap-$PPID-after.txt || true
```

### Annotated screenshots

Use `screenshot --annotate` instead of the old snapshot annotate flow:

```bash
$AB screenshot --annotate /tmp/page.png
```

## Headed fallback for CAPTCHAs and auth walls

When headless automation gets stuck, switch to a headed browser on the same
session:

```bash
$AB --headed open https://example.com/login
```

After the user finishes the CAPTCHA / MFA / auth flow, continue with a fresh
snapshot:

```bash
$AB snapshot -i
```

If the user already has Chrome running with remote debugging enabled, gstack can
attach instead:

```bash
agent-browser --session gstack-$PPID --auto-connect snapshot -i
```

## Cookie import

gstack ships a standalone cookie helper:

- `bin/gstack-cookie-import`
- `bin/gstack-cookie-import-lib.ts`

It reads Chromium cookies from supported local browsers (Comet, Chrome, Arc,
Brave, Edge), decrypts them via macOS Keychain access, converts them into
`agent-browser cookies set ...` commands, and pipes them into the active session.

Typical flow:

```bash
GCI=~/.claude/skills/gstack/bin/gstack-cookie-import
$GCI chrome --domain .github.com | while read -r line; do
  $AB $line
done
$AB cookies
```

In practice, `/setup-browser-cookies` wraps this for you.

## Development

### Setup

```bash
bun install
./setup
```

`./setup` now does the important browser checks:
- generates skill docs
- verifies `agent-browser`
- prepares project-local skill links when relevant

### Common commands

```bash
bun run gen:skill-docs
bun test
bun test test/cookie-import.test.ts
bun test test/skill-parser.test.ts test/skill-validation.test.ts test/gen-skill-docs.test.ts
```

### Smoke test the browser integration

```bash
agent-browser --session gstack-smoke close >/dev/null 2>&1 || true
agent-browser --session gstack-smoke open https://example.com
agent-browser --session gstack-smoke snapshot -i
agent-browser --session gstack-smoke screenshot /tmp/gstack-smoke.png
agent-browser --session gstack-smoke close
```

## Troubleshooting

### `agent-browser` is missing

```bash
npm install -g agent-browser
agent-browser install
```

### `/browse` still fails inside gstack

```bash
cd ~/.claude/skills/gstack
./setup
```

### Cookies are not importing

Run the focused tests first:

```bash
bun test test/cookie-import.test.ts
```

Then verify your local browser/profile names and Keychain access permissions.

## Historical note

Older changelog entries may mention:
- `$B`
- `browse/src/*`
- `browse/dist/browse`
- `find-browse`

Those refer to the retired in-repo browser runtime. This document reflects the
current `agent-browser`-based architecture.
