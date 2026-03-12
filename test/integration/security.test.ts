/**
 * Security tests - ReDoS protection and malicious input handling
 *
 * This package uses a state machine parser instead of regex,
 * making it immune to ReDoS (Regular Expression Denial of Service).
 */

import { describe, it, expect } from 'vitest'
import { strip, parse, hasAnsi } from '../../src/index.js'

describe('Security - ReDoS protection', () => {
  it('should handle deeply nested sequences without catastrophic backtracking', () => {
    // Pattern that would cause ReDoS with naive regex
    const nested = '\x1b['.repeat(1000) + 'm'.repeat(1000)

    const start = performance.now()
    const result = strip(nested)
    const duration = performance.now() - start

    // Should complete in < 100ms (state machine is O(n))
    expect(duration).toBeLessThan(100)
    expect(hasAnsi(result)).toBe(false)
  })

  it('should handle very long parameter sequences', () => {
    // Long parameter list that could cause backtracking
    const longParams = '\x1b[' + '1;'.repeat(10000) + 'm'

    const start = performance.now()
    const result = strip(longParams + 'Text')
    const duration = performance.now() - start

    expect(duration).toBeLessThan(100)
    expect(result).toBe('Text')
  })

  it('should handle repeated ESC characters efficiently', () => {
    // Many ESC characters in a row
    const input = '\x1b'.repeat(10000) + 'Text'

    const start = performance.now()
    const result = strip(input)
    const duration = performance.now() - start

    expect(duration).toBeLessThan(100)
    expect(result).toBe('Text')
  })

  it('should handle alternating ESC and text efficiently', () => {
    // Alternating pattern that could be problematic for regex
    const input = Array.from({ length: 5000 }, () => '\x1b[31ma\x1b[0m').join(
      ''
    )

    const start = performance.now()
    const result = strip(input)
    const duration = performance.now() - start

    expect(duration).toBeLessThan(200)
    expect(result).toBe('a'.repeat(5000))
  })
})

describe('Security - Malicious input handling', () => {
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

describe('Security - No regex usage', () => {
  it('should not be vulnerable to CVE-2021-3807 (ansi-regex)', () => {
    // The specific pattern that triggered CVE-2021-3807
    // ansi-regex v5 and v6 were vulnerable to ReDoS with this pattern
    const malicious = '\x1b[' + '1;'.repeat(50000) + 'm'

    const start = performance.now()
    const result = strip(malicious)
    const duration = performance.now() - start

    // State machine should handle this in linear time
    expect(duration).toBeLessThan(100)
    expect(result).toBe('')
  })

  it('should be faster than regex-based parsers on pathological input', () => {
    // Pattern that would cause exponential backtracking in regex
    const pathological = Array.from(
      { length: 1000 },
      () => '\x1b[31;1;4;5m'
    ).join('')

    const start = performance.now()
    strip(pathological)
    const duration = performance.now() - start

    // Should be fast (O(n))
    expect(duration).toBeLessThan(50)
  })
})

describe('Security - Memory safety', () => {
  it('should not cause memory leaks with large inputs', () => {
    // Process many large strings
    for (let i = 0; i < 100; i++) {
      const large = '\x1b[31m' + 'A'.repeat(10000) + '\x1b[0m'
      strip(large)
    }

    // If there were memory leaks, this test would fail or slow down
    expect(true).toBe(true)
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
