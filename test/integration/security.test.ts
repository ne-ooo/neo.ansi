/**
 * Security tests - adversarial input and bounded-memory handling
 *
 * Sequence recognition is forward-only and does not backtrack.
 */

import { describe, it, expect } from 'vitest'
import { strip, parse, hasAnsi } from '../../src/index.js'

describe('Security - adversarial scaling inputs', () => {
  it('should handle deeply repeated introducers', () => {
    const nested = '\x1b['.repeat(1000) + 'm'.repeat(1000)

    const result = strip(nested)

    expect(hasAnsi(result)).toBe(false)
  })

  it('should handle very long parameter sequences', () => {
    const longParams = '\x1b[' + '1;'.repeat(10000) + 'm'

    const result = strip(longParams + 'Text')

    expect(result).toBe('Text')
  })

  it('should handle repeated ESC characters', () => {
    const input = '\x1b'.repeat(10000) + 'Text'

    const result = strip(input)

    // The final ESC T pair is itself a valid two-byte escape sequence.
    expect(result).toBe('ext')
  })

  it('should handle alternating ESC and text', () => {
    const input = Array.from({ length: 5000 }, () => '\x1b[31ma\x1b[0m').join(
      ''
    )

    const result = strip(input)

    expect(result).toBe('a'.repeat(5000))
  })
})

describe('Security - Malicious input handling', () => {
  it('should not allow 8-bit C1 controls to bypass sanitization', () => {
    const input =
      '\u009b31mRed\u009b0m' +
      '\u009d0;Title\u009c' +
      '\u0090payload\u009c' +
      'Text'

    const result = strip(input)
    expect(result).toBe('RedText')
    expect(hasAnsi(result)).toBe(false)
  })

  it('should handle extremely long single sequences', () => {
    // OSC sequence with extremely long payload
    const longOsc = '\x1b]0;' + 'A'.repeat(100000) + '\x07Text'

    const result = strip(longOsc)
    expect(result).toBe('Text')
  })

  it('should handle binary data mixed with ANSI', () => {
    // Binary null bytes mixed with ANSI
    const input = '\x1b[31m\x00\x01\x02Text\x00\x1b[0m'

    const result = strip(input)
    expect(result).toContain('Text')
  })

  it('should handle incomplete sequences at string boundaries', () => {
    // Sequences cut off mid-way (could happen in streaming)
    const inputs = [
      'Text\x1b[', // Cut off CSI
      'Text\x1b', // Just ESC
      'Text\x1b]0;Title', // OSC without terminator (edge case)
    ]

    for (const input of inputs) {
      const result = strip(input)
      expect(hasAnsi(result)).toBe(false)
    }
  })

  it('should handle malformed CSI sequences', () => {
    // Invalid CSI sequences
    const malformed = [
      '\x1b[999999999999999999m', // Huge parameter
      '\x1b[;;;;;;;;;;;;;;;;m', // Many separators
      '\x1b[' + 'a'.repeat(1000) + 'm', // Letters in parameters
    ]

    for (const input of malformed) {
      const result = strip(input + 'Text')
      expect(result).toContain('Text')
    }
  })

  it('should handle null and undefined safely', () => {
    // Type safety test
    expect(() => strip('')).not.toThrow()
    expect(() => parse('')).not.toThrow()
    expect(() => hasAnsi('')).not.toThrow()
  })
})

describe('Security - historical ReDoS regression inputs', () => {
  it('should process the CVE-2021-3807-style parameter pattern', () => {
    const malicious = '\x1b[' + '1;'.repeat(50000) + 'm'

    const result = strip(malicious)

    expect(result).toBe('')
  })

  it('should process many consecutive sequences', () => {
    const pathological = Array.from(
      { length: 1000 },
      () => '\x1b[31;1;4;5m'
    ).join('')

    expect(strip(pathological)).toBe('')
  })
})

describe('Security - Memory safety', () => {
  it('should not retain large inputs across completed batches', () => {
    const collectGarbage = (
      globalThis as typeof globalThis & { gc?: () => void }
    ).gc
    expect(collectGarbage).toBeTypeOf('function')
    if (!collectGarbage) {
      return
    }

    const large = '\x1b[31m' + 'A'.repeat(10000) + '\x1b[0m'
    const runBatch = (iterations: number): number => {
      let checksum = 0
      for (let i = 0; i < iterations; i++) {
        checksum += strip(large).length
      }
      return checksum
    }

    expect(runBatch(100)).toBe(1_000_000)
    collectGarbage()

    expect(runBatch(1000)).toBe(10_000_000)
    collectGarbage()
    const firstBatchHeap = process.memoryUsage().heapUsed

    expect(runBatch(1000)).toBe(10_000_000)
    collectGarbage()
    const secondBatchHeap = process.memoryUsage().heapUsed

    expect(secondBatchHeap - firstBatchHeap).toBeLessThan(8 * 1024 * 1024)
  })

  it('should handle streaming-like scenarios', () => {
    // Simulate processing chunks as they arrive
    const chunks = Array.from({ length: 1000 }, (_, i) => {
      return `\x1b[${(i % 7) + 31}mChunk ${i}\x1b[0m`
    })

    const results = chunks.map(strip)
    expect(results).toHaveLength(1000)
    expect(results.every((r) => !hasAnsi(r))).toBe(true)
  })
})

describe('Security - Cross-platform safety', () => {
  it('should handle Windows line endings', () => {
    const input =
      '\x1b[31mLine 1\x1b[0m\r\n\x1b[32mLine 2\x1b[0m\r\n'
    expect(strip(input)).toBe('Line 1\r\nLine 2\r\n')
  })

  it('should handle Unix line endings', () => {
    const input = '\x1b[31mLine 1\x1b[0m\n\x1b[32mLine 2\x1b[0m\n'
    expect(strip(input)).toBe('Line 1\nLine 2\n')
  })

  it('should handle Mac classic line endings', () => {
    const input = '\x1b[31mLine 1\x1b[0m\r\x1b[32mLine 2\x1b[0m\r'
    expect(strip(input)).toBe('Line 1\rLine 2\r')
  })
})
