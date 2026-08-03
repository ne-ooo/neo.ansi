# @lpm.dev/neo.ansi

**Modern, zero-dependency ANSI escape code parser and stripper**

Uses linear-time scanning to strip and inspect terminal escape sequences.

## Why neo.ansi?

The ANSI parsing ecosystem has several recurring problems:

1. **Security history**: Old `ansi-regex` releases were affected by **CVE-2021-3807**; current releases contain the fix
2. **Supply Chain**: September 2025 attack compromised 27+ packages including strip-ansi, chalk, debug (2.6B weekly downloads affected)
3. **Dependencies**: strip-ansi depends on ansi-regex, creating dependency chains
4. **Inspection**: Regex-based strippers generally do not return parsed sequence metadata

**neo.ansi solves all of these:**

- ✅ **Zero runtime dependencies** - Reduced runtime supply-chain surface
- ✅ **ReDoS-safe recognition** - Forward scanners and disjoint byte classes
- ✅ **Fast path** - Plain strings return without full parsing
- ✅ **TypeScript-first** - Full type safety
- ✅ **Broad coverage** - CSI, OSC, DCS, SOS, PM, APC, simple ESC sequences, and 8-bit C1 forms
- ✅ **Small bundle** - ~16.2 KB ESM, tree-shakeable
- ✅ **Adversarial tests** - Includes malformed, incomplete, C1, and pathological inputs

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

Strip supported ANSI escape sequences from a string.

```typescript
strip("\x1b[31mRed text\x1b[0m");
// => 'Red text'

strip("\x1b[1;32mBold green\x1b[0m text");
// => 'Bold green text'

// Handles CSI and terminal string-control sequences
strip("Normal \x1b]8;;https://example.com\x1b\\link\x1b]8;;\x1b\\ text");
// => 'Normal link text'
```

### `stripLines(lines: string[], options?: StripOptions): string[]`

Strip ANSI codes from multiple lines efficiently.

```typescript
stripLines(["\x1b[31mLine 1\x1b[0m", "\x1b[32mLine 2\x1b[0m", "Line 3"]);
// => ['Line 1', 'Line 2', 'Line 3']
```

### `hasAnsi(input: string): boolean`

Fast check for ESC and the supported 8-bit C1 introducers/terminators. It does not fully parse the sequence.

```typescript
hasAnsi("\x1b[31mRed\x1b[0m"); // => true
hasAnsi("Plain text"); // => false
```

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

CSI metadata is lossless:

```typescript
const [sequence] = parse("\x1b[?38:2::255:0:0;1 qText").sequences;

sequence.parameterBytes; // '?38:2::255:0:0;1'
sequence.privateMarker; // '?'
sequence.params; // ['38:2::255:0:0', '1'] — colon subparameters stay intact
sequence.intermediateBytes; // ' '
sequence.final; // 'q'
```

Empty semicolon-delimited parameters are preserved, so parsing `\x1b[;m` returns `params: ['', '']`.

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
| `AnsiType.SOS` | Start-of-string controls (`ESC X`) |
| `AnsiType.PM` | Privacy messages (`ESC ^`) |
| `AnsiType.APC` | Application program commands (`ESC _`) |
| `AnsiType.Simple` | Two-character escapes (`ESC letter`) |

## Supported ANSI Sequences

neo.ansi recognizes the common 7-bit ESC forms and their 8-bit C1 equivalents.

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
strip("\x1bP1$rTest\x1b\\After"); // ST terminator
// => 'After'
```

DCS, SOS, PM, and APC require ST (`ESC \\` or C1 ST). BEL is accepted only for OSC compatibility.

### Simple Escapes - `ESC letter`

Two-character escape sequences.

```typescript
strip("\x1b7Save cursor"); // Save cursor
strip("\x1b8Restore cursor"); // Restore cursor
strip("\x1bMReverse index"); // Reverse index
strip("\x1b(BASCII charset"); // ESC intermediate + final
```

## Performance

`strip()` scans directly without creating the sequence objects returned by `parse()`. It has dedicated fast paths for plain text, common ESC-only output, and dense CSI output while retaining the complete scanner as a fallback.

In the reference Apple M5 Pro / Node.js 26.5.0 run, neo.ansi was faster than pinned `strip-ansi@7.2.0` on eight of nine equivalent workloads and about 6% slower on mixed CLI output. The largest measured lead was 4.46x on 10KB text with sparse ANSI. These numbers are environment-specific; see [BENCHMARKS.md](BENCHMARKS.md) for the complete results and reproduction details.

## Security

### ReDoS Protection

neo.ansi uses forward scanners for the complete grammar. Its dense-CSI fast path uses ordered, disjoint byte classes and falls back to the scanner for complex or malformed input, preserving linear scaling.

**CVE-2021-3807** affected historical `ansi-regex` releases before the upstream fix:

- Cause: catastrophic backtracking on malicious input
- Current `ansi-regex` and `strip-ansi` releases are not affected by that historical CVE
- neo.ansi's sequence recognition remains O(n) for this input class

```typescript
// This affected vulnerable historical ansi-regex releases
const malicious = "\x1b[" + "1;".repeat(50000) + "m";

// neo.ansi handles it in linear time
strip(malicious); // => ''
```

### Supply Chain Security

**September 2025 npm attack**:

- 27+ packages compromised including strip-ansi, chalk, debug
- 2.6 billion weekly downloads affected
- Attack vector: Compromised maintainer accounts

**neo.ansi controls**:

- ✅ **Zero runtime dependencies** - No dependency chain to compromise
- ✅ **Committed lockfile** - Reproducible development and release dependency graph
- ✅ **Dependency audit gate** - High/critical development advisories fail CI
- ✅ **Strict TypeScript and adversarial tests**

Zero dependencies reduce supply-chain exposure; they do not eliminate the risk of compromised maintainers or build tooling.

### Terminal-sanitization boundary

`strip()` removes recognized ANSI escape sequences. It is not a complete untrusted-terminal sanitizer: carriage returns, backspace, BEL outside OSC, bidirectional Unicode controls, and other non-ANSI controls may remain. Preserving CSI, OSC, DCS, SOS, PM, or APC sequences should only be done for trusted input.

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

- Zero dependencies
- Linear-time sequence recognition
- Parsed sequence metadata
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

- Linear-time sequence recognition
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
dist/index.js  \x1b[1;32m~16.2 KB\x1b[0m
`;

strip(viteOutput);
// => vite v5.0.0 building for production...
// => ✓ 42 modules transformed.
// => dist/index.js  ~16.2 KB
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
seq.type; // AnsiType ('csi' | 'osc' | 'dcs' | 'sos' | 'pm' | 'apc' | 'simple' | 'unknown')
seq.raw; // string
seq.start; // number
seq.end; // number
seq.params; // string[] | undefined
seq.parameterBytes; // string | undefined
seq.privateMarker; // string | undefined
seq.intermediateBytes; // string | undefined
seq.final; // string | undefined
```

## Bundle Size

- **ESM**: ~16.2 KB
- **CJS**: ~16.6 KB
- **Types**: ~10.9 KB
- **Gzipped ESM**: ~4.0 KB

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
