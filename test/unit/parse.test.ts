/**
 * Unit tests for parse() function
 */

import { describe, it, expect } from 'vitest'
import { parse } from '../../src/core/state-machine.js'
import { AnsiType } from '../../src/types.js'

describe('parse', () => {
  describe('CSI sequences', () => {
    it('should parse simple CSI sequences', () => {
      const result = parse('\x1b[31mRed text\x1b[0m')

      expect(result.text).toBe('Red text')
      expect(result.sequences).toHaveLength(2)

      expect(result.sequences[0]).toMatchObject({
        type: AnsiType.CSI,
        raw: '\x1b[31m',
        start: 0,
        end: 5,
        params: ['31'],
        final: 'm',
      })

      expect(result.sequences[1]).toMatchObject({
        type: AnsiType.CSI,
        raw: '\x1b[0m',
        start: 13,
        end: 17,
        params: ['0'],
        final: 'm',
      })
    })

    it('should parse CSI with multiple parameters', () => {
      const result = parse('\x1b[1;31mBold red\x1b[0m')

      expect(result.text).toBe('Bold red')
      expect(result.sequences[0]).toMatchObject({
        type: AnsiType.CSI,
        params: ['1', '31'],
        final: 'm',
      })
    })

    it('should parse CSI with private markers', () => {
      const result = parse('\x1b[?25hShow cursor')

      expect(result.text).toBe('Show cursor')
      expect(result.sequences[0]).toMatchObject({
        type: AnsiType.CSI,
        raw: '\x1b[?25h',
        final: 'h',
      })
    })

    it('should parse cursor movement CSI', () => {
      const result = parse('Hello\x1b[2AWorld')

      expect(result.text).toBe('HelloWorld')
      expect(result.sequences[0]).toMatchObject({
        type: AnsiType.CSI,
        params: ['2'],
        final: 'A',
      })
    })
  })

  describe('OSC sequences', () => {
    it('should parse OSC terminated by BEL', () => {
      const result = parse('\x1b]0;Window Title\x07Text')

      expect(result.text).toBe('Text')
      expect(result.sequences).toHaveLength(1)
      expect(result.sequences[0]).toMatchObject({
        type: AnsiType.OSC,
        raw: '\x1b]0;Window Title\x07',
        start: 0,
        end: 17,
      })
    })

    it('should parse OSC terminated by ST', () => {
      const result = parse('\x1b]0;Title\x1b\\Text')

      expect(result.text).toBe('Text')
      expect(result.sequences[0]).toMatchObject({
        type: AnsiType.OSC,
        raw: '\x1b]0;Title\x1b\\',
      })
    })

    it('should parse hyperlink OSC', () => {
      const input = '\x1b]8;;https://example.com\x1b\\link\x1b]8;;\x1b\\'
      const result = parse(input)

      expect(result.text).toBe('link')
      expect(result.sequences).toHaveLength(2)
      expect(result.sequences[0]?.type).toBe(AnsiType.OSC)
      expect(result.sequences[1]?.type).toBe(AnsiType.OSC)
    })
  })

  describe('DCS sequences', () => {
    it('should parse DCS terminated by BEL', () => {
      const result = parse('\x1bP1$rTest\x07After')

      expect(result.text).toBe('After')
      expect(result.sequences[0]).toMatchObject({
        type: AnsiType.DCS,
        raw: '\x1bP1$rTest\x07',
      })
    })

    it('should parse DCS terminated by ST', () => {
      const result = parse('\x1bP1$rTest\x1b\\After')

      expect(result.text).toBe('After')
      expect(result.sequences[0]).toMatchObject({
        type: AnsiType.DCS,
        raw: '\x1bP1$rTest\x1b\\',
      })
    })
  })

  describe('Simple escape sequences', () => {
    it('should parse simple two-character escapes', () => {
      const result = parse('\x1b7Save')

      expect(result.text).toBe('Save')
      expect(result.sequences[0]).toMatchObject({
        type: AnsiType.Simple,
        raw: '\x1b7',
        start: 0,
        end: 2,
      })
    })
  })

  describe('Mixed sequences', () => {
    it('should parse multiple sequence types', () => {
      const input = '\x1b[31mRed\x1b]0;Title\x07 Normal \x1b7text'
      const result = parse(input)

      expect(result.text).toBe('Red Normal text')
      expect(result.sequences).toHaveLength(3)
      expect(result.sequences[0]?.type).toBe(AnsiType.CSI)
      expect(result.sequences[1]?.type).toBe(AnsiType.OSC)
      expect(result.sequences[2]?.type).toBe(AnsiType.Simple)
    })

    it('should handle consecutive sequences', () => {
      const result = parse('\x1b[1m\x1b[31m\x1b[4mText\x1b[0m')

      expect(result.text).toBe('Text')
      expect(result.sequences).toHaveLength(4)
    })
  })

  describe('Edge cases', () => {
    it('should handle empty string', () => {
      const result = parse('')

      expect(result.text).toBe('')
      expect(result.sequences).toHaveLength(0)
    })

    it('should handle string with no ANSI codes', () => {
      const result = parse('Plain text')

      expect(result.text).toBe('Plain text')
      expect(result.sequences).toHaveLength(0)
    })

    it('should handle string with only ANSI codes', () => {
      const result = parse('\x1b[31m\x1b[0m')

      expect(result.text).toBe('')
      expect(result.sequences).toHaveLength(2)
    })

    it('should handle malformed CSI sequence', () => {
      const result = parse('\x1b[Invalid')

      // Note: 'I' (0x49) is actually a valid CSI final byte in the VT100 spec
      // So '\x1b[I' is parsed as a CSI sequence, leaving 'nvalid'
      expect(result.text).toBe('nvalid')
      expect(result.sequences[0]?.type).toBe(AnsiType.CSI)
      expect(result.sequences[0]?.final).toBe('I')
    })

    it('should handle incomplete OSC sequence', () => {
      const result = parse('\x1b]0;No terminator')

      expect(result.text).toBe('')
      expect(result.sequences[0]?.type).toBe(AnsiType.OSC)
    })

    it('should preserve Unicode in text', () => {
      const result = parse('\x1b[31m你好🎉\x1b[0m')

      expect(result.text).toBe('你好🎉')
    })

    it('should handle very long strings', () => {
      const longText = 'a'.repeat(10000)
      const input = `\x1b[31m${longText}\x1b[0m`
      const result = parse(input)

      expect(result.text).toBe(longText)
      expect(result.sequences).toHaveLength(2)
    })
  })

  describe('Sequence positions', () => {
    it('should track correct start/end positions', () => {
      const result = parse('Hello \x1b[31mRed\x1b[0m World')

      expect(result.text).toBe('Hello Red World')

      // First sequence at position 6
      expect(result.sequences[0]?.start).toBe(6)
      expect(result.sequences[0]?.end).toBe(11)

      // Second sequence at position 14 (after "Red")
      expect(result.sequences[1]?.start).toBe(14)
      expect(result.sequences[1]?.end).toBe(18)
    })
  })
})
