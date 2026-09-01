# @lpm.dev/neo.ansi

`@lpm.dev/neo.ansi` strips and inspects ANSI terminal sequences in Node.js and
modern browsers.

## Features

- **Sequence support:** Recognizes CSI, OSC, DCS, SOS, PM, APC, simple ESC
  sequences, and 8-bit C1 forms.
- **Parsing:** Returns visible text and metadata for recognized sequences.
- **Streaming:** Strips sequences that span string-chunk boundaries with
  constant parser state.
- **Work bounds:** Uses forward scanners with linear work for recognized input
  classes.
- **TypeScript support:** Includes strict type declarations.
- **Dependency surface:** Has no runtime dependencies.

## Install

Install the package with LPM:

```bash
lpm install @lpm.dev/neo.ansi
```

## Quick start

```typescript
import { hasAnsi, parse, strip } from "@lpm.dev/neo.ansi";

// Strip ANSI codes
strip("\x1b[31mRed text\x1b[0m");
// => "Red text"

// Check for ANSI codes
hasAnsi("\x1b[31mRed\x1b[0m");
// => true

// Parse ANSI sequences
const result = parse("\x1b[31mRed\x1b[0m");
// {
//   text: "Red",
//   sequences: [
//     { type: "csi", raw: "\x1b[31m", start: 0, end: 5, params: ["31"], final: "m" },
//     { type: "csi", raw: "\x1b[0m", start: 8, end: 12, params: ["0"], final: "m" }
//   ]
// }
```

## API

### `strip(input: string, options?: StripOptions): string`

Strips supported ANSI escape sequences from a string.

```typescript
strip("\x1b[31mRed text\x1b[0m");
// => "Red text"

strip("\x1b[1;32mBold green\x1b[0m text");
// => "Bold green text"

// Handles CSI and terminal string-control sequences
strip("Normal \x1b]8;;https://example.com\x1b\\link\x1b]8;;\x1b\\ text");
// => "Normal link text"
```

### `stripLines(lines: string[], options?: StripOptions): string[]`

Strips ANSI sequences from multiple strings.

```typescript
stripLines(["\x1b[31mLine 1\x1b[0m", "\x1b[32mLine 2\x1b[0m", "Line 3"]);
// => ["Line 1", "Line 2", "Line 3"]
```

### `createStreamingStripper(): StreamingStripper`

Creates a stateful stripper for string chunks. It keeps constant parser state
and does not buffer control-string payloads.

```typescript
const stripper = createStreamingStripper();

stripper.write("Hello \x1b[31"); // => "Hello "
stripper.write("mWorld\x1b[0m"); // => "World"
stripper.end(); // => ""
```

Call `end()` after the final chunk. It drops an incomplete final control
sequence, flushes any pending visible UTF-16 code unit, and resets the stripper
for reuse.

### `hasAnsi(input: string): boolean`

Detects ESC and the supported 8-bit C1 introducers or terminators. This function
does not parse the complete sequence.

```typescript
hasAnsi("\x1b[31mRed\x1b[0m"); // => true
hasAnsi("Plain text"); // => false
```

### `hasAnsiAny(inputs: string[]): boolean`

Returns `true` when any input contains a supported sequence prefix.

```typescript
hasAnsiAny(["Plain", "\x1b[31mRed\x1b[0m", "Text"]); // => true
hasAnsiAny(["Plain", "Text"]); // => false
```

### `hasAnsiAll(inputs: string[]): boolean`

Returns `true` when every input contains a supported sequence prefix.

```typescript
hasAnsiAll(["\x1b[31mRed\x1b[0m", "\x1b[32mGreen\x1b[0m"]); // => true
hasAnsiAll(["\x1b[31mRed\x1b[0m", "Plain"]); // => false
```

### `parse(input: string): ParseResult`

Parses ANSI escape sequences and returns visible text with sequence metadata.

```typescript
const result = parse("\x1b[1;31mError:\x1b[0m Failed");

result.text;
// => "Error: Failed"

result.sequences;
// => [
//   {
//     type: "csi",
//     raw: "\x1b[1;31m",
//     start: 0,
//     end: 7,
//     params: ["1", "31"],
//     final: "m"
//   },
//   {
//     type: "csi",
//     raw: "\x1b[0m",
//     start: 13,
//     end: 17,
//     params: ["0"],
//     final: "m"
//   }
// ]
```

Common uses include:

- Debugging ANSI sequences
- Analyzing terminal output
- Building terminal emulators
- Log analysis tools

CSI metadata is lossless:

```typescript
const [sequence] = parse("\x1b[?38:2::255:0:0;1 qText").sequences;

sequence.parameterBytes; // "?38:2::255:0:0;1"
sequence.privateMarker; // "?"
sequence.params; // ["38:2::255:0:0", "1"] — colon subparameters stay intact
sequence.intermediateBytes; // " "
sequence.final; // "q"
```

Empty semicolon-delimited parameters are preserved, so parsing `\x1b[;m` returns
`params: ['', '']`.

### `StripOptions`

Controls which ANSI sequence types remain in the output.

```typescript
interface StripOptions {
  preserve?: AnsiType[]; // Sequence types to keep (all others are stripped)
}
```

```typescript
import { AnsiType, strip } from "@lpm.dev/neo.ansi";

// Strip colors but keep hyperlinks (OSC sequences)
strip(
  "Visit \x1b]8;;https://example.com\x1b\\link\x1b]8;;\x1b\\ \x1b[32mhere\x1b[0m",
  {
    preserve: [AnsiType.OSC],
  },
);
// => "Visit \x1b]8;;https://example.com\x1b\\link\x1b]8;;\x1b\\ here"

// Keep colors but strip everything else
strip("\x1b[31mRed\x1b]0;Title\x07\x1b[0m text", { preserve: [AnsiType.CSI] });
// => "\x1b[31mRed\x1b[0m text"

// Preserve multiple types
strip(input, { preserve: [AnsiType.CSI, AnsiType.OSC] });

// preserve: [] is equivalent to no options — strips all
strip(input, { preserve: [] });
```

**`AnsiType` values:**

| Value              | Sequences                                              |
| ------------------ | ------------------------------------------------------ |
| `AnsiType.CSI`     | Colors, cursor movement, SGR (`ESC [`)                 |
| `AnsiType.OSC`     | Hyperlinks, window titles (`ESC ]`)                    |
| `AnsiType.DCS`     | Device control strings (`ESC P`)                       |
| `AnsiType.SOS`     | Start-of-string controls (`ESC X`)                     |
| `AnsiType.PM`      | Privacy messages (`ESC ^`)                             |
| `AnsiType.APC`     | Application program commands (`ESC _`)                 |
| `AnsiType.Simple`  | Simple/intermediate ESC sequences and standalone C1 ST |
| `AnsiType.Unknown` | Malformed, canceled, or incomplete sequences           |

Use any non-empty `preserve` option only with trusted terminal output.
Preserving `AnsiType.Unknown` can re-emit malformed or incomplete control
prefixes. These prefixes can become active after concatenation with later text.

## Behavior and limits

`hasAnsi()` detects supported introducers and terminators without complete
parsing. If you require sequence validity or metadata, use `parse()`.

The streaming stripper keeps constant parser state. It does not buffer
control-string payloads.

### Supported ANSI sequences

The package recognizes common 7-bit ESC forms and their 8-bit C1 equivalents.

#### CSI (Control Sequence Introducer) — `ESC [`

CSI includes colors, display controls, and cursor movement.

```typescript
strip("\x1b[31mRed\x1b[0m"); // SGR colors
strip("\x1b[1;32mBold green\x1b[0m"); // Multiple parameters
strip("\x1b[2AUp\x1b[5CRight"); // Cursor movement
strip("Clear\x1b[2J"); // Erase display
strip("\x1b[?25hShow cursor"); // Private sequences
```

#### OSC (Operating System Command) — `ESC ]`

OSC includes hyperlinks and window titles.

```typescript
// Hyperlinks (terminated by BEL or ST)
strip("\x1b]8;;https://example.com\x1b\\link\x1b]8;;\x1b\\");
// => "link"

// Window title (terminated by BEL)
strip("\x1b]0;My Title\x07Text");
// => "Text"
```

#### DCS (Device Control String) — `ESC P`

Device-specific sequences.

```typescript
strip("\x1bP1$rTest\x1b\\After"); // ST terminator
// => "After"
```

DCS, SOS, PM, and APC terminate normally with ST (`ESC \\` or C1 ST). BEL is
accepted only for OSC compatibility. CAN, SUB, ESC, or any C1 control cancels an
unfinished string control, after which scanning resumes.

#### Simple and intermediate escapes

Two-character ESC forms, ESC sequences with intermediate bytes, and standalone
C1 ST.

```typescript
strip("\x1b7Save cursor"); // Save cursor
strip("\x1b8Restore cursor"); // Restore cursor
strip("\x1bMReverse index"); // Reverse index
strip("\x1b(BASCII charset"); // ESC intermediate + final
```

## Performance

`strip()` scans directly without creating the sequence objects returned by
`parse()`. It has dedicated fast paths for plain text and common ESC-only output
while retaining the complete scanner for C1 and selective-preservation behavior.

In one Apple M5 Pro and Node.js 26.5.0 run, the package led four of eleven
equivalent workloads.

The 1 MB plain-text result was within 1%. The largest measured lead was 2.90x
for 10 KB of text with sparse ANSI.

See [BENCHMARKS.md](./BENCHMARKS.md) for the environment, method, complete
results, and limits.

Run the benchmark suite:

```bash
lpm run bench
```

Benchmark results depend on the runtime, computer, options, and input data.

## Security

### ReDoS protection

The package uses bounded, forward scanners for the sequence grammar. Native
candidate searches skip long ordinary payload spans, and byte-class loops
classify the candidate controls. No sequence-recognition expression contains
ambiguous quantified groups.

**CVE-2021-3807** affected historical `ansi-regex` releases before the upstream
fix:

- Cause: catastrophic backtracking on malicious input
- Current `ansi-regex` and `strip-ansi` releases are not affected by that
  historical CVE
- The package uses linear work for this input class

```typescript
// This affected vulnerable historical ansi-regex releases
const malicious = "\x1b[" + "1;".repeat(50000) + "m";

// neo.ansi handles it in linear time
strip(malicious); // => ""
```

### Supply-chain security

The package has no runtime dependencies. The repository commits its lockfile and
applies a dependency audit gate during continuous integration.

These controls reduce the dependency surface. They do not prevent a compromised
maintainer or build tool.

### Terminal sanitization boundary

`strip()` removes recognized ANSI escape sequences. It is not a complete
untrusted-terminal sanitizer. The output can contain carriage returns,
backspace, BEL outside OSC, bidirectional Unicode controls, and other controls.

Use a non-empty `preserve` option only with trusted terminal output.

## Migration from `strip-ansi`

```typescript
// Before
import stripAnsi from "strip-ansi";
const clean = stripAnsi("\x1b[31mRed\x1b[0m");

// After
import { strip } from "@lpm.dev/neo.ansi";
const clean = strip("\x1b[31mRed\x1b[0m");
```

Run the application tests after the migration.

## Migration from `ansi-regex`

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

Run the application tests after the migration.

## Examples

### Test runner output

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

### Build tool output

```typescript
const viteOutput = `
\x1b[36mvite\x1b[0m \x1b[32mv5.0.0\x1b[0m building for production...
\x1b[32m✓\x1b[0m 42 modules transformed.
dist/index.js  \x1b[1;32m~28.7 KiB\x1b[0m
`;

strip(viteOutput);
// => vite v5.0.0 building for production...
// => ✓ 42 modules transformed.
// => dist/index.js  ~28.7 KiB
```

### Log analysis

```typescript
const logs = [
  "\x1b[32m[INFO]\x1b[0m Server started",
  "\x1b[31m[ERROR]\x1b[0m Connection failed",
  "\x1b[33m[WARN]\x1b[0m Deprecated API used",
];

const clean = stripLines(logs);
// => ["[INFO] Server started", "[ERROR] Connection failed", "[WARN] Deprecated API used"]
```

### Terminal hyperlinks

```typescript
const hyperlink =
  "Visit \x1b]8;;https://example.com\x1b\\example.com\x1b]8;;\x1b\\ for more";

strip(hyperlink);
// => "Visit example.com for more"
```

## TypeScript

Full TypeScript support with strict types:

```typescript
import { parse } from "@lpm.dev/neo.ansi";
import type { AnsiSequence, ParseResult } from "@lpm.dev/neo.ansi";

const result: ParseResult = parse("\x1b[31mRed\x1b[0m");
result.text; // string
result.sequences; // AnsiSequence[]

const sequences: AnsiSequence[] = result.sequences;
const [seq] = sequences;
if (seq) {
  seq.type; // AnsiType
  seq.raw; // string
  seq.start; // number
  seq.end; // number
  seq.params; // string[] | undefined
  seq.parameterBytes; // string | undefined
  seq.privateMarker; // string | undefined
  seq.intermediateBytes; // string | undefined
  seq.final; // string | undefined
}
```

## Bundle size

- **ESM**: ~28.7 KiB
- **CJS**: ~29.1 KiB
- **Types**: ~12.0 KiB
- **Gzipped ESM**: ~5.9 KiB

Bundlers can remove unused exports.

## Runtime support

- **Node.js:** 18 or later
- **Browsers:** Modern browsers
- **Module formats:** ESM and CommonJS
- **TypeScript:** Declaration files included

```typescript
// Browser
import { strip } from "@lpm.dev/neo.ansi";

// Node.js
const { strip } = require("@lpm.dev/neo.ansi");
```

## License

MIT. See [LICENSE](./LICENSE).
