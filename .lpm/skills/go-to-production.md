---
name: go-to-production
description: Production patterns for neo.ansi — stateful streaming, line-by-line vs full buffer, ReDoS immunity, allocation costs, and high-throughput processing
version: "1.1.0"
globs:
  - "**/*.ts"
  - "**/*.js"
---

# Go to Production with @lpm.dev/neo.ansi

## Streaming: Handle Chunk Boundaries

The one-shot `strip()` and `parse()` functions process complete strings.
Use `createStreamingStripper()` when ANSI sequences can cross chunk
boundaries.

### The problem

```
Chunk 1: "Hello \x1b[31"      ← incomplete CSI (no final byte)
Chunk 2: "mWorld\x1b[0m"      ← "m" completes chunk 1's sequence
```

Stripping each chunk independently produces `"Hello mWorld"` — the `m` leaks as literal text.

### Recommended stateful pattern

```typescript
import { createStreamingStripper } from '@lpm.dev/neo.ansi'

const stripper = createStreamingStripper()

stream.setEncoding('utf8')
stream.on('data', (chunk: string) => {
  output.write(stripper.write(chunk))
})
stream.on('end', () => {
  output.write(stripper.end())
})
```

The streaming stripper processes each code unit once and retains only parser
state. It does not store an incomplete OSC, DCS, SOS, PM, or APC payload, so
an unterminated attacker-controlled control string cannot grow a pending
buffer or trigger repeated rescanning. `end()` drops any incomplete final
control sequence and resets the instance.

When stream chunks are `Buffer` objects, decode them with Node.js
`StringDecoder` before calling `stripper.write()`. Calling `buffer.toString()` on
each chunk separately can corrupt a UTF-8 character split across two chunks.

```typescript
import { StringDecoder } from 'node:string_decoder'
import { createStreamingStripper } from '@lpm.dev/neo.ansi'

const decoder = new StringDecoder('utf8')
const stripper = createStreamingStripper()

stream.on('data', chunk => {
  output.write(stripper.write(decoder.write(chunk)))
})
stream.on('end', () => {
  const tail = decoder.end()
  if (tail) output.write(stripper.write(tail))
  output.write(stripper.end())
})
```

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

`strip()` has fast paths for plain text and common ESC-only output. The bundled suite performs output-equivalent comparisons against a pinned `strip-ansi` version. Absolute performance still depends on the Node/browser version, input distribution, and hardware; see `BENCHMARKS.md` for the recorded environment and results.

## ReDoS Immunity

Complete sequence recognition is forward-only and O(n). Native searches skip
ordinary spans, and bounded byte-class loops classify possible controls.

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
    ? JSON.parse(
        JSON.stringify(entry.data, (_key, value) =>
          typeof value === 'string' ? strip(value) : value
        )
      )
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

Use every non-empty `preserve` configuration only with trusted terminal
output. Preserved sequences remain active controls; malformed or incomplete
`AnsiType.Unknown` sequences are particularly unsafe to re-emit.
