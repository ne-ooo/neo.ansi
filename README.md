# @lpm.dev/neo.ansi

**Modern, zero-dependency ANSI escape code parser and stripper**

Beats strip-ansi by 10%+ with a state machine parser that's **ReDoS-safe** and **blazingly fast**.

## Why neo.ansi?

The ANSI parsing ecosystem has critical problems:

1. **Security**: `ansi-regex` (used by strip-ansi) had **CVE-2021-3807** (ReDoS vulnerability)
2. **Supply Chain**: September 2025 attack compromised 27+ packages including strip-ansi, chalk, debug (2.6B weekly downloads affected)
3. **Dependencies**: strip-ansi depends on ansi-regex, creating dependency chains
4. **Performance**: Regex-based parsers are slower and vulnerable to pathological input

**neo.ansi solves all of these:**

- ✅ **Zero runtime dependencies** - No supply chain risk
- ✅ **ReDoS-safe** - State machine parser, not regex
- ✅ **10%+ faster** than strip-ansi on most workloads
- ✅ **16.6M ops/sec** on plain text (fast path optimization)
- ✅ **TypeScript-first** - Full type safety
- ✅ **Comprehensive** - Handles all ANSI sequence types (CSI, OSC, DCS, simple escapes)
- ✅ **Small bundle** - ~7 KB ESM, tree-shakeable
- ✅ **100% test coverage** - 111 tests including security tests

## Installation

```bash
lpm install @lpm.dev/neo.ansi
```

## Quick Start

```typescript
import { strip, hasAnsi, parse } from "@lpm.dev/neo.ansi";

// Strip ANSI codes
strip("\x1b[31mRed text\x1b[0m");
// => 'Red text'

// Check for ANSI codes
hasAnsi("\x1b[31mRed\x1b[0m");
// => true

// Parse ANSI sequences
const result = parse("\x1b[31mRed\x1b[0m");
// {
//   text: 'Red',
//   sequences: [
//     { type: 'csi', raw: '\x1b[31m', start: 0, end: 5, params: ['31'], final: 'm' },
//     { type: 'csi', raw: '\x1b[0m', start: 8, end: 12, params: ['0'], final: 'm' }
//   ]
// }
```

## API

### `strip(input: string, options?: StripOptions): string`

Strip all ANSI escape codes from a string.

```typescript
strip("\x1b[31mRed text\x1b[0m");
// => 'Red text'

strip("\x1b[1;32mBold green\x1b[0m text");
// => 'Bold green text'

// Handles all sequence types
strip("Normal \x1b]8;;https://example.com\x1b\\link\x1b]8;;\x1b\\ text");
// => 'Normal link text'
```

**Performance**: 1.3M ops/sec on simple text, 16.6M ops/sec on plain text (fast path)

### `stripLines(lines: string[], options?: StripOptions): string[]`

Strip ANSI codes from multiple lines efficiently.

```typescript
stripLines(["\x1b[31mLine 1\x1b[0m", "\x1b[32mLine 2\x1b[0m", "Line 3"]);
// => ['Line 1', 'Line 2', 'Line 3']
```

### `hasAnsi(input: string): boolean`

Fast check if string contains ANSI codes (doesn't parse, just checks for ESC).

```typescript
hasAnsi("\x1b[31mRed\x1b[0m"); // => true
hasAnsi("Plain text"); // => false
```

**Performance**: 200M+ checks/sec for strings without ANSI

### `hasAnsiAny(inputs: string[]): boolean`

Check if any string in array contains ANSI codes (short-circuits on first match).

```typescript
hasAnsiAny(["Plain", "\x1b[31mRed\x1b[0m", "Text"]); // => true
hasAnsiAny(["Plain", "Text"]); // => false
```

### `hasAnsiAll(inputs: string[]): boolean`

Check if all strings in array contain ANSI codes.

```typescript
hasAnsiAll(["\x1b[31mRed\x1b[0m", "\x1b[32mGreen\x1b[0m"]); // => true
hasAnsiAll(["\x1b[31mRed\x1b[0m", "Plain"]); // => false
```

### `parse(input: string): ParseResult`

Parse ANSI escape sequences and extract both text and sequence metadata.

```typescript
const result = parse("\x1b[1;31mError:\x1b[0m Failed");

result.text;
// => 'Error: Failed'

result.sequences;
// => [
//   {
//     type: 'csi',
//     raw: '\x1b[1;31m',
//     start: 0,
//     end: 8,
//     params: ['1', '31'],
//     final: 'm'
//   },
//   {
//     type: 'csi',
//     raw: '\x1b[0m',
//     start: 14,
//     end: 18,
//     params: ['0'],
//     final: 'm'
//   }
// ]
```

**Use cases**:

- Debugging ANSI sequences
- Analyzing terminal output
- Building terminal emulators
- Log analysis tools

### `StripOptions`

Options for selective stripping — preserve specific ANSI sequence types while stripping others.

```typescript
interface StripOptions {
  preserve?: AnsiType[]; // Sequence types to keep (all others are stripped)
}
```

```typescript
import { strip, AnsiType } from "@lpm.dev/neo.ansi";

// Strip colors but keep hyperlinks (OSC sequences)
strip(
  "Visit \x1b]8;;https://example.com\x1b\\link\x1b]8;;\x1b\\ \x1b[32mhere\x1b[0m",
  {
    preserve: [AnsiType.OSC],
  },
);
// => 'Visit \x1b]8;;https://example.com\x1b\\link\x1b]8;;\x1b\\ here'

// Keep colors but strip everything else
strip("\x1b[31mRed\x1b]0;Title\x07\x1b[0m text", { preserve: [AnsiType.CSI] });
// => '\x1b[31mRed\x1b[0m text'

// Preserve multiple types
strip(input, { preserve: [AnsiType.CSI, AnsiType.OSC] });

// preserve: [] is equivalent to no options — strips all
strip(input, { preserve: [] });
```

**`AnsiType` values:**
| Value | Sequences |
|-------|-----------|
| `AnsiType.CSI` | Colors, cursor movement, SGR (`ESC [`) |
| `AnsiType.OSC` | Hyperlinks, window titles (`ESC ]`) |
| `AnsiType.DCS` | Device control strings (`ESC P`) |
| `AnsiType.Simple` | Two-character escapes (`ESC letter`) |

## Supported ANSI Sequences

neo.ansi handles all VT100/ECMA-48 ANSI escape sequence types:

### CSI (Control Sequence Introducer) - `ESC [`

Most common sequences for colors, cursor movement, etc.

```typescript
strip("\x1b[31mRed\x1b[0m"); // SGR colors
strip("\x1b[1;32mBold green\x1b[0m"); // Multiple parameters
strip("\x1b[2AUp\x1b[5CRight"); // Cursor movement
strip("Clear\x1b[2J"); // Erase display
strip("\x1b[?25hShow cursor"); // Private sequences
```

### OSC (Operating System Command) - `ESC ]`

Hyperlinks, window titles, etc.

```typescript
// Hyperlinks (terminated by BEL or ST)
strip("\x1b]8;;https://example.com\x1b\\link\x1b]8;;\x1b\\");
// => 'link'

// Window title (terminated by BEL)
strip("\x1b]0;My Title\x07Text");
// => 'Text'
```

### DCS (Device Control String) - `ESC P`

Device-specific sequences.

```typescript
strip("\x1bP1$rTest\x07After"); // BEL terminator
strip("\x1bP1$rTest\x1b\\After"); // ST terminator
// => 'After'
```

### Simple Escapes - `ESC letter`

Two-character escape sequences.

```typescript
strip("\x1b7Save cursor"); // Save cursor
strip("\x1b8Restore cursor"); // Restore cursor
strip("\x1bMReverse index"); // Reverse index
```

## Performance

Benchmark results on Apple Silicon M1:

| Operation                  | ops/sec   | Notes                               |
| -------------------------- | --------- | ----------------------------------- |
| **Simple ANSI**            | 1.3M      | 26-42% faster than strip-ansi       |
| **Plain text (fast path)** | **16.6M** | No ESC = instant return             |
| **Complex sequences**      | 660K      | OSC hyperlinks, cursor movement     |
| **Mixed content**          | 195K      | Real-world test output              |
| **100 log lines**          | 11K       | Typical log file parsing            |
| **Pathological input**     | 2.7-22K   | **ReDoS-safe** (regex parsers fail) |

### Comparison vs strip-ansi

| Feature            | neo.ansi                    | strip-ansi      |
| ------------------ | --------------------------- | --------------- |
| **Performance**    | 1.3M ops/sec                | ~1.1M ops/sec   |
| **Fast path**      | 16.6M ops/sec               | None            |
| **ReDoS safe**     | ✅ Yes (state machine)      | ❌ No (regex)   |
| **Dependencies**   | 0                           | 1 (ansi-regex)  |
| **Bundle size**    | 6.91 KB ESM                 | ~4 KB           |
| **TypeScript**     | ✅ First-class              | Community types |
| **Parse metadata** | ✅ Yes                      | ❌ No           |
| **Sequence types** | All (CSI, OSC, DCS, simple) | All             |

## Security

### ReDoS Protection

neo.ansi uses a **state machine parser** instead of regex, making it **immune to ReDoS** (Regular Expression Denial of Service).

**CVE-2021-3807** (ansi-regex vulnerability):

- Affected: strip-ansi, chalk, inquirer, ora, and 100+ other packages
- Cause: Regex catastrophic backtracking on malicious input
- neo.ansi: **Not affected** - state machine is O(n), handles pathological input safely

```typescript
// This would cause ReDoS in ansi-regex
const malicious = "\x1b[" + "1;".repeat(50000) + "m";

// neo.ansi handles it in ~44ms (linear time)
strip(malicious); // => ''
```

### Supply Chain Security

**September 2025 npm attack**:

- 27+ packages compromised including strip-ansi, chalk, debug
- 2.6 billion weekly downloads affected
- Attack vector: Compromised maintainer accounts

**neo.ansi protection**:

- ✅ **Zero runtime dependencies** - No dependency chain to compromise
- ✅ **@lpm.dev namespace** - Consistent security practices
- ✅ **Comprehensive tests** - 111 tests including 16 security tests
- ✅ **TypeScript strict mode** - Type safety prevents many vulnerabilities

## Migration Guide

### From strip-ansi

```typescript
// Before
import stripAnsi from "strip-ansi";
const clean = stripAnsi("\x1b[31mRed\x1b[0m");

// After
import { strip } from "@lpm.dev/neo.ansi";
const clean = strip("\x1b[31mRed\x1b[0m");
```

**Benefits**:

- 10%+ faster
- Zero dependencies
- ReDoS-safe
- Type-safe

### From ansi-regex

```typescript
// Before
import ansiRegex from "ansi-regex";
const hasAnsi = ansiRegex().test(string);
const clean = string.replace(ansiRegex(), "");

// After
import { hasAnsi, strip } from "@lpm.dev/neo.ansi";
const hasAnsiCodes = hasAnsi(string);
const clean = strip(string);
```

**Benefits**:

- No ReDoS vulnerability
- Faster detection (200M+ ops/sec)
- Simpler API

## Real-World Use Cases

### Test Runner Output

```typescript
const output = `
\x1b[1;32m ✓ \x1b[0m\x1b[2mtest/unit/strip.test.ts\x1b[0m \x1b[2m(26 tests)\x1b[0m
\x1b[1;31m ✗ \x1b[0m\x1b[2mtest/unit/parse.test.ts\x1b[0m \x1b[2m(1 failed)\x1b[0m
`;

strip(output);
// =>
// ✓ test/unit/strip.test.ts (26 tests)
// ✗ test/unit/parse.test.ts (1 failed)
```

### Build Tool Output

```typescript
const viteOutput = `
\x1b[36mvite\x1b[0m \x1b[32mv5.0.0\x1b[0m building for production...
\x1b[32m✓\x1b[0m 42 modules transformed.
dist/index.js  \x1b[1;32m6.91 KB\x1b[0m
`;

strip(viteOutput);
// => vite v5.0.0 building for production...
// => ✓ 42 modules transformed.
// => dist/index.js  6.91 KB
```

### Log Analysis

```typescript
const logs = [
  "\x1b[32m[INFO]\x1b[0m Server started",
  "\x1b[31m[ERROR]\x1b[0m Connection failed",
  "\x1b[33m[WARN]\x1b[0m Deprecated API used",
];

const clean = stripLines(logs);
// => ['[INFO] Server started', '[ERROR] Connection failed', '[WARN] Deprecated API used']
```

### Terminal Hyperlinks

```typescript
const hyperlink =
  "Visit \x1b]8;;https://example.com\x1b\\example.com\x1b]8;;\x1b\\ for more";

strip(hyperlink);
// => 'Visit example.com for more'
```

## TypeScript

Full TypeScript support with strict types:

```typescript
import type { AnsiSequence, ParseResult, AnsiType } from "@lpm.dev/neo.ansi";

const result: ParseResult = parse("\x1b[31mRed\x1b[0m");
result.text; // string
result.sequences; // AnsiSequence[]

const seq: AnsiSequence = result.sequences[0];
seq.type; // AnsiType ('csi' | 'osc' | 'dcs' | 'simple' | 'unknown')
seq.raw; // string
seq.start; // number
seq.end; // number
seq.params; // string[] | undefined
seq.final; // string | undefined
```

## Bundle Size

- **ESM**: 6.91 KB
- **CJS**: 7.20 KB
- **Types**: 9.16 KB
- **Gzipped**: ~2.3 KB

Tree-shakeable: Import only what you need.

## Browser Support

Works in all modern browsers and Node.js 18+.

```typescript
// Browser
import { strip } from "@lpm.dev/neo.ansi";

// Node.js
const { strip } = require("@lpm.dev/neo.ansi");
```

## License

MIT
