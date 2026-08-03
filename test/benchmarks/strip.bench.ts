/**
 * Reproducible strip benchmarks against pinned strip-ansi.
 *
 * Every comparison validates equivalent output before registering benches.
 */

import { bench, describe } from 'vitest'
import stripAnsi from 'strip-ansi'
import { AnsiType, parse, strip as neoStrip } from '../../src/index.js'

const mixed = `\x1b[1;32m✓\x1b[0m Test passed \x1b[2m(10ms)\x1b[0m
\x1b[1;31m✗\x1b[0m Test failed \x1b[2mExpected\x1b[0m \x1b[31m5\x1b[0m \x1b[2mbut got\x1b[0m \x1b[32m10\x1b[0m`

const hyperlink =
  'Visit \x1b]8;;https://example.com\x1b\\example.com\x1b]8;;\x1b\\ for more'

const logLines = Array.from({ length: 100 }, (_, i) => {
  const color = i % 3 === 0 ? '31' : i % 2 === 0 ? '33' : '32'
  return `\x1b[${color}m[LOG ${i}]\x1b[0m Message ${i}`
}).join('\n')

const workloads = [
  {
    name: 'plain text',
    input: 'Plain text without any ANSI codes at all',
  },
  { name: 'simple SGR', input: '\x1b[31mRed text\x1b[0m' },
  { name: 'mixed CLI output', input: mixed },
  { name: 'OSC hyperlink', input: hyperlink },
  { name: '100 log lines', input: logLines },
  {
    name: '10KB sparse ANSI',
    input: '\x1b[31m' + 'A'.repeat(10_000) + '\x1b[0m',
  },
  {
    name: '1000 consecutive sequences',
    input: Array.from({ length: 1000 }, () => '\x1b[31;1;4;5m').join(''),
  },
  {
    name: '1000 CSI parameters',
    input: '\x1b[' + '1;'.repeat(1000) + 'm',
  },
  {
    name: 'unterminated CSI parameters',
    input: 'prefix\x1b[' + '1;'.repeat(1000) + '123',
  },
] as const

describe('strip comparison', () => {
  for (const { name, input } of workloads) {
    const expected = stripAnsi(input)
    const actual = neoStrip(input)
    if (actual !== expected) {
      throw new Error(`Benchmark output mismatch for ${name}`)
    }

    describe(name, () => {
      bench('neo.ansi', () => {
        neoStrip(input)
      })

      bench('strip-ansi', () => {
        stripAnsi(input)
      })
    })
  }
})

describe('neo.ansi features', () => {
  bench('parse metadata: mixed CLI output', () => {
    parse(mixed)
  })

  bench('preserve CSI while stripping OSC', () => {
    neoStrip(`${hyperlink}\x1b[31mRed\x1b[0m`, {
      preserve: [AnsiType.CSI],
    })
  })

  bench('C1 CSI stripping', () => {
    neoStrip('\u009b31mRed\u009b0m')
  })
})
