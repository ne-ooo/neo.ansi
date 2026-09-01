---
name: anti-patterns
description: Common mistakes when using neo.ansi — redundant hasAnsi guards, parse vs strip misuse, preserve pitfalls, chunk boundary leaks, and hasAnsiAll edge cases
version: "1.1.0"
globs:
  - "**/*.ts"
  - "**/*.js"
---

# Anti-Patterns for @lpm.dev/neo.ansi

### [HIGH] Guarding strip() with hasAnsi() — double scan

Wrong:

```typescript
const clean = hasAnsi(input) ? strip(input) : input
```

Correct:

```typescript
const clean = strip(input)
```

`strip()` already calls the same ESC/C1 detection used by `hasAnsi()`. The guarded version scans the string twice. Just call `strip()` directly.

Source: `src/core/strip.ts` and `src/utils/has-ansi.ts`

### [HIGH] Using parse() when you only need the clean text

Wrong:

```typescript
const result = parse(coloredOutput)
const cleanText = result.text
```

Correct:

```typescript
const cleanText = strip(coloredOutput)
```

`parse()` allocates an `AnsiSequence` object per sequence (including raw bytes, positions, and CSI metadata) plus the result wrapper. `strip()` scans directly and skips those metadata allocations. Use `parse()` only when you need the `sequences` array — for debugging, transforming sequences, or building custom strippers.

Source: `src/core/strip.ts` and `src/core/state-machine.ts`

### [HIGH] Passing raw strings instead of AnsiType enum to preserve

Wrong:

```typescript
strip(input, { preserve: ['csi'] })
```

Correct:

```typescript
import { AnsiType } from '@lpm.dev/neo.ansi'
strip(input, { preserve: [AnsiType.CSI] })
```

This silently works at runtime because `AnsiType.CSI === 'csi'` (string enum). But TypeScript rejects the raw string. An AI testing in a `.js` file or with `// @ts-ignore` would ship code that breaks if the enum values are ever refactored to numeric.

Source: `src/types.ts` — AnsiType is a string enum, maintainer interview

### [MEDIUM] Using .map(strip) instead of stripLines()

Wrong:

```typescript
const cleaned = lines.map(line => strip(line))
```

Correct:

```typescript
import { stripLines } from '@lpm.dev/neo.ansi'
const cleaned = stripLines(lines)
```

`stripLines()` does exactly this but signals intent and is discoverable in the API. Functionally identical, but using the dedicated function avoids re-inventing existing API surface.

Source: `src/core/strip.ts` — stripLines preallocates and fills the result array

### [CRITICAL] Stripping chunks independently in a stream — character leakage

Wrong:

```typescript
// Processing a log stream chunk by chunk
stream.on('data', (chunk) => {
  const clean = strip(chunk.toString())
  output.write(clean)
})
```

Correct:

```typescript
import { StringDecoder } from 'node:string_decoder'
import { createStreamingStripper } from '@lpm.dev/neo.ansi'

const decoder = new StringDecoder('utf8')
const stripper = createStreamingStripper()

stream.on('data', rawChunk => {
  output.write(stripper.write(decoder.write(rawChunk)))
})

stream.on('end', () => {
  const tail = decoder.end()
  if (tail) output.write(stripper.write(tail))
  output.write(stripper.end())
})
```

ANSI sequences can split across chunk boundaries. If chunk 1 ends with `\x1b[31` and chunk 2 starts with `mWorld`, stripping each independently leaks `m` into the output as literal text. The stateful stripper carries only parser state across calls, so it neither leaks the split sequence nor buffers and repeatedly rescans an unbounded control-string payload. For byte streams, use Node.js `StringDecoder` instead of calling `toString()` on each chunk so a split UTF-8 character is not corrupted.

Source: `src/core/stream.ts`

### [MEDIUM] Assuming hasAnsiAll([]) returns true

Wrong:

```typescript
// "If all lines are clean, skip processing"
if (!hasAnsiAll(lines)) {
  // Expecting this to be true for empty input
  return lines
}
```

Correct:

```typescript
if (lines.length === 0) return lines
if (!hasAnsiAny(lines)) return lines
```

`hasAnsiAll([])` returns `false`, not `true`. An empty array does not satisfy "all strings contain ANSI." Similarly, `hasAnsiAll(['', '\x1b[31mRed\x1b[0m'])` returns `false` because the empty string lacks ANSI. Use `hasAnsiAny()` to check if processing is needed.

Source: `src/utils/has-ansi.ts` — returns false for empty array
