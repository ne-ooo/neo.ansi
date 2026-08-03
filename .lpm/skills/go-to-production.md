---
name: go-to-production
description: Production patterns for neo.ansi — streaming with chunk buffering, line-by-line vs full buffer, ReDoS immunity, allocation costs, and high-throughput processing
version: "1.0.0"
globs:
  - "**/*.ts"
  - "**/*.js"
---

# Go to Production with @lpm.dev/neo.ansi

## Streaming: Handle Chunk Boundaries

The parser is stateless — each `strip()` or `parse()` call processes a complete string independently. ANSI sequences split across chunk boundaries require manual buffering.

### The problem

```
Chunk 1: "Hello \x1b[31"      ← incomplete CSI (no final byte)
Chunk 2: "mWorld\x1b[0m"      ← "m" completes chunk 1's sequence
```

Stripping each chunk independently produces `"Hello mWorld"` — the `m` leaks as literal text.

### Recommended buffering pattern

```typescript
import { parse, strip, AnsiType } from '@lpm.dev/neo.ansi'

let buffer = ''

function processChunk(chunk: string): string {
  const input = buffer + chunk
  buffer = ''

  const result = parse(input)
  const lastSeq = result.sequences.at(-1)

  if (lastSeq?.type === AnsiType.Unknown && lastSeq.end === input.length) {
    // Last sequence is incomplete — buffer it for next chunk
    buffer = lastSeq.raw
    return strip(input.slice(0, lastSeq.start))
  }

  return strip(input)
}
```

Key insight: only the **last** sequence in a parse result can be incomplete (marked `AnsiType.Unknown` at EOF). Mid-string Unknown sequences are genuinely malformed, not split.

### Streaming with readline (built-in backpressure)

```typescript
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { strip } from '@lpm.dev/neo.ansi'

const rl = createInterface({ input: createReadStream('huge.log') })

for await (const line of rl) {
  const clean = strip(line)
  // process clean line
}
```

readline splits on `\n`, so sequences spanning lines are rare (common for log output). This naturally handles backpressure through the Node.js stream pipeline. Don't load multi-GB files into memory and `strip()` the whole buffer.

## Line-by-Line vs Full Buffer

### Use line-by-line (`stripLines`) when:

- Lines are independent (log output — sequences don't span lines)
- You're already splitting on `\n` for other reasons
- Memory pressure matters (GC handles small strings better)

```typescript
import { stripLines } from '@lpm.dev/neo.ansi'

const lines = logBuffer.split('\n')
const clean = stripLines(lines)
```

### Use full buffer (`strip`) when:

- Sequences can span lines (terminal recordings, raw PTY output)
- You want to minimize function call overhead
- The data is already a single string and fits in memory

```typescript
import { strip } from '@lpm.dev/neo.ansi'

const clean = strip(entireLogFile)
```

## Performance Characteristics

`strip()` has fast paths for plain text, common ESC-only output, and dense CSI output. The bundled suite performs output-equivalent comparisons against a pinned `strip-ansi` version. Absolute performance still depends on the Node/browser version, input distribution, and hardware; see `BENCHMARKS.md` for the recorded environment and results.

## ReDoS Immunity

Complete sequence recognition is forward-only and O(n). The dense-CSI fast path uses ordered, disjoint byte classes and falls back to the scanner if an ESC/C1 control remains.

The security suite includes patterns that affected historical vulnerable regex implementations:

| Pattern | Expected scaling |
|---------|------------------|
| `\x1b[` + `"1;"` x 50,000 + `m` | Linear |
| 1,000 repeated introducers | Linear |
| 100K-character OSC payload | Linear |

This is tested in `test/integration/security.test.ts`, including a pattern associated with CVE-2021-3807. Current fixed `ansi-regex` releases are not affected by that historical advisory.

## Allocation Costs

Each `parse()` call allocates:

- One `ParseResult` object
- One string for `text`
- One array for `sequences`
- One `AnsiSequence` object per sequence, including raw bytes, positions, and optional CSI metadata

For a typical colored log line (`\x1b[32m[INFO]\x1b[0m message`), that's 2 sequence objects + the wrapper. At 100K+ lines/sec, this GC pressure is measurable.

`strip()` does not call `parse()`. It scans directly, allocates no sequence metadata, and returns the original string unchanged on its plain-text path. Inputs that contain ANSI still allocate the stripped output string and may allocate string fragments internally.

`stripLines()` preallocates the output array, but each ANSI-containing line still needs its stripped output string.

## Integration with Log Processing

### With neo.logger

```typescript
import { createLogger, CustomTransport } from '@lpm.dev/neo.logger'
import { strip } from '@lpm.dev/neo.ansi'

// Strip ANSI from logs before sending to external service
const cleanTransport = new CustomTransport(async (entry) => {
  const cleanMessage = strip(entry.message)
  const cleanData = entry.data
    ? JSON.parse(strip(JSON.stringify(entry.data)))
    : undefined
  await sendToService({ ...entry, message: cleanMessage, data: cleanData })
})
```

### Cleaning CLI/test runner output

```typescript
import { strip } from '@lpm.dev/neo.ansi'

// After capturing test runner or CLI output as a string
function cleanOutput(rawOutput: string): string {
  return strip(rawOutput)
  // Result is clean text suitable for CI logs, notifications, or reports
}
```

### Selective stripping for terminals that support hyperlinks

```typescript
import { strip, AnsiType } from '@lpm.dev/neo.ansi'

// Keep OSC hyperlinks, strip colors
const terminalFriendly = strip(input, { preserve: [AnsiType.OSC] })

// Keep colors, strip everything else
const colorsOnly = strip(input, { preserve: [AnsiType.CSI] })
```
