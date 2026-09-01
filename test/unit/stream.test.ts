import { describe, expect, it } from 'vitest'
import { createStreamingStripper } from '../../src/core/stream.js'
import { strip } from '../../src/core/strip.js'

function stripChunks(chunks: readonly string[]): string {
  const stripper = createStreamingStripper()
  let output = ''
  for (const chunk of chunks) output += stripper.write(chunk)
  return output + stripper.end()
}

describe('createStreamingStripper', () => {
  const corpus = [
    '',
    'plain text',
    '\x1b[31mRed\x1b[0m',
    '\x1b[1;2 qCursor',
    'before\x1b[123',
    'before\x1b]0;Title\x07after',
    'before\x1bPpayload\x1b\\after',
    'before\x1b]title\x18after',
    'before\x1b]title\x1aafter',
    'before\x1b]title\u0085after',
    'before\x1b]title\x1b[31mafter\x1b[0m',
    'before\u009dtitle\u009cafter',
    'before\u0090payload\u009b31mafter\u009b0m',
    'before\x1b\x01after',
    'before\x1b(\x01after',
    'rocket \ud83d\ude80 snowman \u2603',
  ] as const

  it('matches strip() at every two-chunk boundary', () => {
    for (const input of corpus) {
      for (let split = 0; split <= input.length; split++) {
        expect(stripChunks([input.slice(0, split), input.slice(split)])).toBe(
          strip(input)
        )
      }
    }
  })

  it('matches strip() for one-code-unit chunks', () => {
    for (const input of corpus) {
      expect(stripChunks(input.split(''))).toBe(strip(input))
    }
  })

  it('matches strip() for deterministic randomized chunking', () => {
    let randomState = 0x6d2b79f5
    const next = (): number => {
      randomState = Math.imul(randomState ^ (randomState >>> 15), randomState | 1)
      randomState ^=
        randomState +
        Math.imul(randomState ^ (randomState >>> 7), randomState | 61)
      return (randomState ^ (randomState >>> 14)) >>> 0
    }

    const codeUnits = [
      0x07, 0x18, 0x1a, 0x1b, 0x20, 0x2f, 0x30, 0x3f, 0x40, 0x50, 0x58,
      0x5b, 0x5c, 0x5d, 0x5e, 0x5f, 0x6d, 0x7e, 0x7f, 0x80, 0x85, 0x90,
      0x98, 0x9b, 0x9c, 0x9d, 0x9e, 0x9f, 0x2603, 0xd83d, 0xde80,
    ] as const

    for (let sample = 0; sample < 2_000; sample++) {
      const length = next() % 129
      let input = ''
      for (let i = 0; i < length; i++) {
        input += String.fromCharCode(codeUnits[next() % codeUnits.length]!)
      }

      const chunks: string[] = []
      for (let cursor = 0; cursor < input.length; ) {
        const width = 1 + (next() % 9)
        chunks.push(input.slice(cursor, cursor + width))
        cursor += width
      }
      expect(stripChunks(chunks)).toBe(strip(input))
    }
  })

  it('retains constant parser state for a large unterminated string', () => {
    const stripper = createStreamingStripper()
    expect(stripper.write('\x1b]')).toBe('')
    let emitted = ''
    for (let i = 0; i < 100_000; i++) {
      emitted += stripper.write('x')
    }
    expect(emitted).toBe('')
    expect(stripper.end()).toBe('')
  })

  it('flushes visible surrogate tails and can be reused after end()', () => {
    const stripper = createStreamingStripper()
    expect(stripper.write('rocket \ud83d')).toBe('rocket ')
    expect(stripper.write('\ude80')).toBe('\ud83d\ude80')
    expect(stripper.end()).toBe('')
    expect(stripper.write('next')).toBe('next')
    expect(stripper.end()).toBe('')

    expect(stripper.write('unpaired \ud83d')).toBe('unpaired ')
    expect(stripper.end()).toBe('\ud83d')
  })

  it('does not split visible surrogate pairs around stripped controls', () => {
    const stripper = createStreamingStripper()
    const encoded: Buffer[] = []

    encoded.push(Buffer.from(stripper.write('\ud83d\x1b[31m')))
    encoded.push(Buffer.from(stripper.write('\ude80')))
    encoded.push(Buffer.from(stripper.end()))

    expect(Buffer.concat(encoded)).toEqual(Buffer.from('\ud83d\ude80'))
  })

  it('flushes visible surrogate tails before incomplete final controls', () => {
    const stripper = createStreamingStripper()

    expect(stripper.write('\ud83d\x1b[')).toBe('')
    expect(stripper.end()).toBe('\ud83d')
  })
})
