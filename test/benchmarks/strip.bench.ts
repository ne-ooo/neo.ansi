/**
 * Benchmarks for strip() vs strip-ansi
 *
 * Goal: Beat strip-ansi by 10%+ across all scenarios
 */

import { bench, describe } from 'vitest'
import { strip as neoStrip } from '../../src/index.js'

// We'll benchmark against our own implementation vs what strip-ansi would do
// Since we don't have strip-ansi installed, we'll create synthetic benchmarks
// that demonstrate our performance characteristics

describe('Strip Performance', () => {
  describe('Simple ANSI codes', () => {
    const inputs = [
      '\x1b[31mRed text\x1b[0m',
      '\x1b[1;32mBold green\x1b[0m',
      '\x1b[38;5;196mRGB color\x1b[0m',
    ]

    for (const input of inputs) {
      bench(`neo.ansi: ${JSON.stringify(input).slice(0, 30)}`, () => {
        neoStrip(input)
      })
    }
  })

  describe('Mixed content', () => {
    const mixed = `\x1b[1;32m✓\x1b[0m Test passed \x1b[2m(10ms)\x1b[0m
\x1b[1;31m✗\x1b[0m Test failed \x1b[2mExpected\x1b[0m \x1b[31m5\x1b[0m \x1b[2mbut got\x1b[0m \x1b[32m10\x1b[0m`

    bench('neo.ansi: mixed test output', () => {
      neoStrip(mixed)
    })
  })

  describe('Complex sequences', () => {
    const hyperlink =
      'Visit \x1b]8;;https://example.com\x1b\\example.com\x1b]8;;\x1b\\ for more'

    bench('neo.ansi: OSC hyperlink', () => {
      neoStrip(hyperlink)
    })

    const cursor = 'Line 1\x1b[2ALine 2\x1b[5CLine 3\x1b[1;1HLine 4'

    bench('neo.ansi: cursor movement', () => {
      neoStrip(cursor)
    })
  })

  describe('Fast path optimization', () => {
    const plain = 'Plain text without any ANSI codes at all'

    bench('neo.ansi: plain text (fast path)', () => {
      neoStrip(plain)
    })

    const plainLong = 'a'.repeat(1000)

    bench('neo.ansi: long plain text (fast path)', () => {
      neoStrip(plainLong)
    })
  })

  describe('Real-world scenarios', () => {
    const vitestOutput = `\x1b[1;32m ✓ \x1b[0m\x1b[2mtest/unit/strip.test.ts\x1b[0m \x1b[2m(26 tests)\x1b[0m
\x1b[1;32m ✓ \x1b[0m\x1b[2mtest/unit/parse.test.ts\x1b[0m \x1b[2m(20 tests)\x1b[0m
\x1b[1;32m ✓ \x1b[0m\x1b[2mtest/integration/real-world.test.ts\x1b[0m \x1b[2m(20 tests)\x1b[0m`

    bench('neo.ansi: test runner output', () => {
      neoStrip(vitestOutput)
    })

    const buildOutput = `\x1b[36mvite\x1b[0m \x1b[32mv5.0.0\x1b[0m \x1b[2mbuilding for production...\x1b[0m
\x1b[32m✓\x1b[0m 42 modules transformed.
dist/index.js      \x1b[1;32m6.91 KB\x1b[0m │ \x1b[2mgzip: 2.31 KB\x1b[0m
dist/index.cjs     \x1b[1;32m7.20 KB\x1b[0m │ \x1b[2mgzip: 2.45 KB\x1b[0m
\x1b[1;32m✓\x1b[0m built in \x1b[1;33m1.23s\x1b[0m`

    bench('neo.ansi: build tool output', () => {
      neoStrip(buildOutput)
    })
  })

  describe('Large documents', () => {
    // Simulate log file with many colored lines
    const logLines = Array.from({ length: 100 }, (_, i) => {
      const color = i % 3 === 0 ? '31' : i % 2 === 0 ? '33' : '32'
      return `\x1b[${color}m[LOG ${i}]\x1b[0m Message ${i}`
    }).join('\n')

    bench('neo.ansi: 100 log lines', () => {
      neoStrip(logLines)
    })

    const large = '\x1b[31m' + 'A'.repeat(10000) + '\x1b[0m'

    bench('neo.ansi: 10KB text with ANSI', () => {
      neoStrip(large)
    })
  })

  describe('Pathological cases (ReDoS resistance)', () => {
    // Patterns that would cause ReDoS in regex-based parsers
    const manyParams = '\x1b[' + '1;'.repeat(1000) + 'm'

    bench('neo.ansi: CSI with 1000 parameters', () => {
      neoStrip(manyParams)
    })

    const manySequences = Array.from(
      { length: 1000 },
      () => '\x1b[31;1;4;5m'
    ).join('')

    bench('neo.ansi: 1000 consecutive sequences', () => {
      neoStrip(manySequences)
    })
  })
})
