---
name: getting-started
description: How to import and use neo.ansi — strip, parse, hasAnsi, selective stripping with preserve, and batch processing with stripLines
version: "1.0.0"
globs:
  - "**/*.ts"
  - "**/*.js"
  - "**/*.tsx"
  - "**/*.jsx"
---

# Getting Started with @lpm.dev/neo.ansi

## Import Patterns

```typescript
// Core functions
import { strip, stripLines, parse } from '@lpm.dev/neo.ansi'

// Detection utilities
import { hasAnsi, hasAnsiAny, hasAnsiAll } from '@lpm.dev/neo.ansi'

// Types and enums (for selective stripping)
import { AnsiType } from '@lpm.dev/neo.ansi'
import type { AnsiSequence, ParseResult, StripOptions } from '@lpm.dev/neo.ansi'
```

## Stripping ANSI Codes

### Basic stripping

```typescript
import { strip } from '@lpm.dev/neo.ansi'

const clean = strip('\x1b[31mError:\x1b[0m file not found')
// 'Error: file not found'
```

`strip()` has a built-in fast path — if the string contains no ESC character (`\x1b`), it returns the input immediately without parsing. No need to guard with `hasAnsi()` first.

### Batch stripping

```typescript
import { stripLines } from '@lpm.dev/neo.ansi'

const lines = [
  '\x1b[32m[INFO]\x1b[0m Server started',
  '\x1b[31m[ERROR]\x1b[0m Connection failed',
  'Plain text line'
]

const clean = stripLines(lines)
// ['[INFO] Server started', '[ERROR] Connection failed', 'Plain text line']
```

Use `stripLines()` instead of `lines.map(line => strip(line))` — it's the same operation but signals intent.

### Selective stripping with preserve

Keep specific ANSI sequence types while removing others:

```typescript
import { strip, AnsiType } from '@lpm.dev/neo.ansi'

// Keep colors (CSI) but remove OSC hyperlinks
const clean = strip(input, { preserve: [AnsiType.CSI] })

// Keep both CSI and OSC, strip DCS and simple escapes
const clean = strip(input, { preserve: [AnsiType.CSI, AnsiType.OSC] })
```

Always use the `AnsiType` enum, not raw strings:

```typescript
// Correct
strip(input, { preserve: [AnsiType.CSI] })

// Wrong — TypeScript error (works at runtime but breaks type safety)
strip(input, { preserve: ['csi'] })
```

## ANSI Sequence Types

| Type | Enum Value | Example | Description |
|------|-----------|---------|-------------|
| CSI | `AnsiType.CSI` | `\x1b[31m` | Colors, styles, cursor movement |
| OSC | `AnsiType.OSC` | `\x1b]8;;url\x1b\\` | Hyperlinks, window titles |
| DCS | `AnsiType.DCS` | `\x1bP1$r\x1b\\` | Device control strings |
| Simple | `AnsiType.Simple` | `\x1b7` | Two-character escapes (save/restore cursor) |
| Unknown | `AnsiType.Unknown` | `\x1b[` (incomplete) | Malformed or truncated sequences |

## Parsing (When You Need Metadata)

Use `parse()` only when you need sequence metadata — positions, types, parameters:

```typescript
import { parse } from '@lpm.dev/neo.ansi'

const result = parse('\x1b[1;31mBold Red\x1b[0m')

result.text        // 'Bold Red'
result.sequences   // Array of AnsiSequence objects:
// [
//   { type: 'csi', raw: '\x1b[1;31m', start: 0, end: 7, params: ['1', '31'], final: 'm' },
//   { type: 'csi', raw: '\x1b[0m', start: 15, end: 19, params: ['0'], final: 'm' }
// ]
```

If you only need the clean text, use `strip()` instead — same result with clearer intent.

## Detection Utilities

```typescript
import { hasAnsi, hasAnsiAny, hasAnsiAll } from '@lpm.dev/neo.ansi'

// Single string check
hasAnsi('\x1b[31mRed\x1b[0m')  // true
hasAnsi('Plain text')            // false

// Any string in array has ANSI? (short-circuits on first match)
hasAnsiAny(['Plain', '\x1b[31mRed\x1b[0m'])  // true

// All strings have ANSI?
hasAnsiAll(['\x1b[31mRed\x1b[0m', '\x1b[32mGreen\x1b[0m'])  // true
hasAnsiAll([])  // false (empty array)
```

`hasAnsi()` uses a simple `string.includes('\x1b')` check — it does not parse. Use it when you need to branch on ANSI presence without stripping.
