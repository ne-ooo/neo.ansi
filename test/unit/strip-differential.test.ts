import { describe, expect, it } from 'vitest'
import { parse } from '../../src/core/state-machine.js'
import { strip } from '../../src/core/strip.js'
import { AnsiType } from '../../src/types.js'

const corpusBytes = [
  0x07,
  0x1b,
  0x20,
  0x2f,
  0x30,
  0x3a,
  0x3b,
  0x3f,
  0x40,
  0x50,
  0x58,
  0x5b,
  0x5c,
  0x5d,
  0x5e,
  0x5f,
  0x6d,
  0x7e,
  0x7f,
  0x90,
  0x98,
  0x9b,
  0x9c,
  0x9d,
  0x9e,
  0x9f,
  0x2603,
  0xd83d,
  0xde80,
] as const

function createRandomCorpus(count: number): string[] {
  let state = 0x6d2b79f5
  const next = (): number => {
    state = Math.imul(state ^ (state >>> 15), state | 1)
    state ^= state + Math.imul(state ^ (state >>> 7), state | 61)
    return (state ^ (state >>> 14)) >>> 0
  }

  return Array.from({ length: count }, () => {
    const length = next() % 257
    let input = ''
    for (let i = 0; i < length; i++) {
      input += String.fromCharCode(corpusBytes[next() % corpusBytes.length]!)
    }
    return input
  })
}

function stripWithParseReference(
  input: string,
  preserve: readonly AnsiType[] = []
): string {
  const { sequences } = parse(input)
  let text = ''
  let cursor = 0

  for (const sequence of sequences) {
    text += input.slice(cursor, sequence.start)
    if (preserve.includes(sequence.type)) text += sequence.raw
    cursor = sequence.end
  }

  return text + input.slice(cursor)
}

describe('strip differential behavior', () => {
  const corpus = [
    ...createRandomCorpus(1_000),
    `\x1b[31mred\x1b[0m\x1b[1mbold\x1b[0m${'x'.repeat(128)}`,
    `\x1b[31mred\x1b[0m\x1b]0;title\x07${'x'.repeat(128)}`,
    `\x1b[31mred\x1b[0m\x1b[${'1;'.repeat(128)}`,
  ]

  it('matches parse() for deterministic mixed and malformed inputs', () => {
    for (const input of corpus) {
      expect(strip(input)).toBe(parse(input).text)
    }
  })

  it('matches a parse-based preserve reference', () => {
    const preserve = [AnsiType.CSI, AnsiType.OSC, AnsiType.Unknown]
    for (const input of corpus) {
      expect(strip(input, { preserve })).toBe(
        stripWithParseReference(input, preserve)
      )
    }
  })
})
