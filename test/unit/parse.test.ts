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
        parameterBytes: '?25',
        privateMarker: '?',
        params: ['25'],
        intermediateBytes: '',
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

    it('should parse the full parameter-byte range and intermediates', () => {
      const privateResult = parse('\x1b[<5hMouse')
      const intermediateResult = parse('\x1b[1 qCursor')

      expect(privateResult.text).toBe('Mouse')
      expect(privateResult.sequences[0]).toMatchObject({
        type: AnsiType.CSI,
        parameterBytes: '<5',
        privateMarker: '<',
        params: ['5'],
        intermediateBytes: '',
        final: 'h',
      })
      expect(intermediateResult.text).toBe('Cursor')
      expect(intermediateResult.sequences[0]).toMatchObject({
        type: AnsiType.CSI,
        raw: '\x1b[1 q',
        parameterBytes: '1',
        params: ['1'],
        intermediateBytes: ' ',
        final: 'q',
      })
    })

    it('should preserve empty and colon-delimited CSI parameter metadata', () => {
      const extendedColor = parse('\x1b[38:2::255:0:0;1mText')
      const emptyParameters = parse('\x1b[;mText')

      expect(extendedColor.sequences[0]).toMatchObject({
        parameterBytes: '38:2::255:0:0;1',
        params: ['38:2::255:0:0', '1'],
        intermediateBytes: '',
      })
      expect(emptyParameters.sequences[0]).toMatchObject({
        parameterBytes: ';',
        params: ['', ''],
      })
    })

    it('should parse 8-bit C1 CSI sequences', () => {
      const result = parse('\u009b31mRed\u009b0m')

      expect(result.text).toBe('Red')
      expect(result.sequences).toHaveLength(2)
      expect(result.sequences[0]).toMatchObject({
        type: AnsiType.CSI,
        raw: '\u009b31m',
        params: ['31'],
        final: 'm',
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

    it('should parse C1 OSC and C1 ST', () => {
      const result = parse('\u009d0;Title\u009cText')

      expect(result.text).toBe('Text')
      expect(result.sequences[0]).toMatchObject({
        type: AnsiType.OSC,
        raw: '\u009d0;Title\u009c',
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

    it('should mark a canceled OSC unknown and retain following text', () => {
      const result = parse('\x1b]0;Title\x18Visible')

      expect(result.text).toBe('Visible')
      expect(result.sequences[0]).toMatchObject({
        type: AnsiType.Unknown,
        raw: '\x1b]0;Title\x18',
      })
    })

    it('should reprocess a non-ST ESC after a canceled OSC', () => {
      const result = parse('\x1b]0;Title\x1b[31mVisible\x1b[0m')

      expect(result.text).toBe('Visible')
      expect(result.sequences.map((sequence) => sequence.type)).toEqual([
        AnsiType.Unknown,
        AnsiType.CSI,
        AnsiType.CSI,
      ])
    })
  })

  describe('DCS sequences', () => {
    it('should not treat BEL as a DCS terminator', () => {
      const result = parse('\x1bP1$rBefore\x07After\x1b\\Text')

      expect(result.text).toBe('Text')
      expect(result.sequences[0]).toMatchObject({
        type: AnsiType.DCS,
        raw: '\x1bP1$rBefore\x07After\x1b\\',
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

    it('should parse C1 DCS terminated by C1 ST', () => {
      const result = parse('\u00901$rTest\u009cAfter')

      expect(result.text).toBe('After')
      expect(result.sequences[0]).toMatchObject({
        type: AnsiType.DCS,
        raw: '\u00901$rTest\u009c',
      })
    })
  })

  describe('SOS, PM, and APC sequences', () => {
    it.each([
      ['SOS', '\x1bXpayload\x1b\\', AnsiType.SOS],
      ['PM', '\x1b^payload\x1b\\', AnsiType.PM],
      ['APC', '\x1b_payload\x1b\\', AnsiType.APC],
      ['C1 SOS', '\u0098payload\u009c', AnsiType.SOS],
      ['C1 PM', '\u009epayload\u009c', AnsiType.PM],
      ['C1 APC', '\u009fpayload\u009c', AnsiType.APC],
    ])('should classify %s independently', (_name, sequence, type) => {
      const result = parse(`${sequence}Text`)

      expect(result.text).toBe('Text')
      expect(result.sequences[0]?.type).toBe(type)
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

    it('should parse ESC sequences with intermediate bytes', () => {
      const result = parse('\x1b(BText')

      expect(result.text).toBe('Text')
      expect(result.sequences[0]).toMatchObject({
        type: AnsiType.Simple,
        raw: '\x1b(B',
      })
    })

    it('should reprocess a repeated ESC as a new introducer', () => {
      const result = parse('\x1b\x1b[31mRed')

      expect(result.text).toBe('Red')
      expect(result.sequences.map((sequence) => sequence.type)).toEqual([
        AnsiType.Unknown,
        AnsiType.CSI,
      ])
    })

    it('should strip a standalone C1 ST', () => {
      const result = parse('Before\u009cAfter')

      expect(result.text).toBe('BeforeAfter')
      expect(result.sequences[0]).toMatchObject({
        type: AnsiType.Simple,
        raw: '\u009c',
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
      expect(result.sequences[0]?.type).toBe(AnsiType.Unknown)
    })

    it('should mark every incomplete string control as unknown', () => {
      for (const input of [
        '\x1bPpayload',
        '\x1bXpayload',
        '\x1b^payload',
        '\x1b_payload',
        '\u0090payload',
        '\u0098payload',
        '\u009dpayload',
        '\u009epayload',
        '\u009fpayload',
      ]) {
        const result = parse(input)
        expect(result.sequences.at(-1)).toMatchObject({
          type: AnsiType.Unknown,
          end: input.length,
        })
      }
    })

    it('should mark an incomplete ESC intermediate sequence as unknown', () => {
      const input = '\x1b('
      const result = parse(input)

      expect(result.text).toBe('')
      expect(result.sequences[0]).toMatchObject({
        type: AnsiType.Unknown,
        raw: input,
        end: input.length,
      })
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
