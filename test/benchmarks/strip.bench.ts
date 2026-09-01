/**
 * Reproducible strip benchmarks against pinned strip-ansi.
 *
 * Every comparison validates equivalent output before registering benches.
 */

import { bench, describe } from 'vitest'
import stripAnsi from 'strip-ansi'
import {
  AnsiType,
  createStreamingStripper,
  parse,
  strip as neoStrip,
} from '../../src/index.js'

const mixed = `\x1b[1;32m✓\x1b[0m Test passed \x1b[2m(10ms)\x1b[0m
\x1b[1;31m✗\x1b[0m Test failed \x1b[2mExpected\x1b[0m \x1b[31m5\x1b[0m \x1b[2mbut got\x1b[0m \x1b[32m10\x1b[0m`

const hyperlink =
  'Visit \x1b]8;;https://example.com\x1b\\example.com\x1b]8;;\x1b\\ for more'

const logLines = Array.from({ length: 100 }, (_, i) => {
  const color = i % 3 === 0 ? '31' : i % 2 === 0 ? '33' : '32'
  return `\x1b[${color}m[LOG ${i}]\x1b[0m Message ${i}`
}).join('\n')

const clusteredCsiPrefix =
  '\x1b[31mA\x1b[0mB\x1b[1m' + 'x'.repeat(1_000_000)
const csiGroup = '\x1b[31mA\x1b[0mB\x1b[1m'
const sampledDensityTrap =
  csiGroup +
  'x'.repeat(500_000) +
  csiGroup +
  'x'.repeat(500_000) +
  csiGroup
const densityBoundaryTrap = csiGroup + 'x'.repeat(65_536 - csiGroup.length)
const longOsc = '\x1b]0;' + 'x'.repeat(1_000_000)
const longDcs = '\x1bP' + 'x'.repeat(1_000_000)
const longC1Osc = '\u009d0;' + 'x'.repeat(1_000_000)
const longC1Dcs = '\u0090' + 'x'.repeat(1_000_000)
const denseVisible = Array.from(
  { length: 1_000 },
  () => '\x1b[31ma'
).join('')

function stripInChunks(input: string, chunkSize: number): number {
  const stripper = createStreamingStripper()
  let outputLength = 0
  for (let cursor = 0; cursor < input.length; cursor += chunkSize) {
    outputLength += stripper.write(input.slice(cursor, cursor + chunkSize)).length
  }
  return outputLength + stripper.end().length
}

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
    name: '1MB plain text',
    input: 'x'.repeat(1_000_000),
  },
  {
    name: 'clustered CSI prefix with 1MB plain tail',
    input: clusteredCsiPrefix,
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

  bench('sparse CSI: sampled-window trap', () => {
    neoStrip(sampledDensityTrap)
  })

  bench('sparse CSI: 64KiB boundary trap', () => {
    neoStrip(densityBoundaryTrap)
  })

  bench('1MB unterminated 7-bit OSC', () => {
    neoStrip(longOsc)
  })

  bench('1MB unterminated 7-bit DCS', () => {
    neoStrip(longDcs)
  })

  bench('1MB unterminated C1 OSC', () => {
    neoStrip(longC1Osc)
  })

  bench('1MB unterminated C1 DCS', () => {
    neoStrip(longC1Dcs)
  })

  bench('streaming 1MB OSC: 7-unit chunks', () => {
    stripInChunks(longOsc, 7)
  })

  bench('streaming 1MB OSC: 8-unit chunks', () => {
    stripInChunks(longOsc, 8)
  })

  bench('1000 dense sequences with visible text', () => {
    neoStrip(denseVisible)
  })
})
