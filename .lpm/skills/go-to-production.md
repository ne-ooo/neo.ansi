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

| Input Type | ops/sec | Notes |
|-----------|---------|-------|
| Plain text (no ANSI) | 16.6M | Fast path — `includes('\x1b')` returns false |
| Simple colors/styles | 1.3M | Typical colored log line |
| Complex (OSC, DCS) | 660K-695K | Hyperlinks, device control |
| Mixed content | 195K | Various sequence types |
| Real-world CLI output | 103K-133K | npm, git, test runners |
| 100 log lines batch | 11K | Batch processing |
| 10KB text with ANSI | 5.4K | Large buffer |

The fast path is critical: if most of your input is plain text (no ANSI), `strip()` is essentially free at 16.6M ops/sec.

## ReDoS Immunity

The state machine parser is O(n) for **all** inputs. This is the primary reason to choose neo.ansi over regex-based alternatives in production.

Pathological inputs that would freeze regex-based strippers:

| Pattern | neo.ansi | regex-based |
|---------|---------|-------------|
| `\x1b[` + `"1;"` x 50,000 + `m` | <100ms | Minutes (catastrophic backtracking) |
| 1,000 nested `\x1b[` sequences | Linear time | Exponential |
| 100K-char OSC payload | Linear time | Exponential |

In log processing pipelines where you don't control the input (user data, third-party services), a single malicious string can peg CPU at 100% for minutes with a regex stripper. neo.ansi processes it in milliseconds.

This is tested in `test/integration/security.test.ts` including the exact pattern from CVE-2021-3807 (the `ansi-regex` vulnerability).

## Allocation Costs

Each `parse()` call allocates:

- One `ParseResult` object
- One string for `text`
- One array for `sequences`
- One `AnsiSequence` object per sequence (with `type`, `raw`, `start`, `end`, optional `params`, `final`)

For a typical colored log line (`\x1b[32m[INFO]\x1b[0m message`), that's 2 sequence objects + the wrapper. At 100K+ lines/sec, this GC pressure is measurable.

`strip()` calls `parse()` internally, so the allocations still happen — they're just immediately eligible for GC. There is no allocation-free strip mode.

For extreme throughput requirements, batch processing with `stripLines()` amortizes the per-call overhead.

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
