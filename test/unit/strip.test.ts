/**
 * Unit tests for strip() function
 */

import { describe, it, expect } from 'vitest'
import { strip, stripLines } from '../../src/core/strip.js'
import {
  ANSI_BYTE_RANGE,
  CSI_FINAL_BYTE,
} from '../../src/core/constants.js'
import { AnsiType } from '../../src/types.js'

describe('strip', () => {
  describe('CSI sequences (ESC [)', () => {
    it('should strip SGR color codes', () => {
      expect(strip('\x1b[31mRed text\x1b[0m')).toBe('Red text')
      expect(strip('\x1b[32mGreen\x1b[0m')).toBe('Green')
      expect(strip('\x1b[1;31mBold red\x1b[0m')).toBe('Bold red')
    })

    it('should strip cursor movement codes', () => {
      expect(strip('Hello\x1b[2AWorld')).toBe('HelloWorld')
      expect(strip('Test\x1b[5Cmore')).toBe('Testmore')
      expect(strip('\x1b[1;1HPositioned')).toBe('Positioned')
    })

    it('should strip erase codes', () => {
      expect(strip('Clear\x1b[2Jscreen')).toBe('Clearscreen')
      expect(strip('Erase\x1b[Kline')).toBe('Eraseline')
    })

    it('should strip multiple CSI sequences', () => {
      expect(strip('\x1b[31mRed\x1b[0m \x1b[32mGreen\x1b[0m')).toBe('Red Green')
      expect(strip('\x1b[1m\x1b[31m\x1b[4mText\x1b[0m')).toBe('Text')
    })

    it('should fall back safely when common CSI sequences precede other input', () => {
      const padding = 'x'.repeat(64)
      expect(strip(`${padding}\x1b[31mRed\x1b[0m\x1b]0;Title\x07Text`)).toBe(
        `${padding}RedText`
      )
      expect(strip(`${padding}\x1b[31mRed\x1b[0m\x1b[123`)).toBe(
        `${padding}Red`
      )
      expect(strip(`${padding}\x1b[31mRed\x1b[0m\x1b\x01Text`)).toBe(
        `${padding}Red\x01Text`
      )
    })

    it('should handle CSI with parameters', () => {
      expect(strip('\x1b[38;5;196mRed\x1b[0m')).toBe('Red')
      expect(strip('\x1b[1;2;3;4;5mMany params\x1b[0m')).toBe('Many params')
    })

    it('should handle CSI with private markers', () => {
      expect(strip('\x1b[?25hShow cursor')).toBe('Show cursor')
      expect(strip('\x1b[?1049hAlt buffer')).toBe('Alt buffer')
    })

    it('should strip CSI intermediates and all private parameter bytes', () => {
      expect(strip('\x1b[1 qCursor')).toBe('Cursor')
      expect(strip('\x1b[<5hMouse')).toBe('Mouse')
      expect(strip('\x1b[=1hMode')).toBe('Mode')
    })

    it('should strip 8-bit C1 CSI sequences', () => {
      expect(strip('\u009b31mRed\u009b0m')).toBe('Red')
    })

    it('should accept every CSI byte-class boundary', () => {
      for (
        let code = ANSI_BYTE_RANGE.CSI_PARAMETER_MIN;
        code <= ANSI_BYTE_RANGE.CSI_PARAMETER_MAX;
        code++
      ) {
        expect(strip(`\x1b[${String.fromCharCode(code)}mText`)).toBe('Text')
      }

      for (
        let code = ANSI_BYTE_RANGE.CSI_INTERMEDIATE_MIN;
        code <= ANSI_BYTE_RANGE.CSI_INTERMEDIATE_MAX;
        code++
      ) {
        expect(strip(`\x1b[${String.fromCharCode(code)}qText`)).toBe('Text')
      }

      for (let code = CSI_FINAL_BYTE.MIN; code <= CSI_FINAL_BYTE.MAX; code++) {
        expect(strip(`\x1b[${String.fromCharCode(code)}Text`)).toBe('Text')
      }
    })
  })

  describe('OSC sequences (ESC ])', () => {
    it('should strip OSC terminated by BEL', () => {
      expect(strip('\x1b]0;Window Title\x07Text')).toBe('Text')
      expect(strip('Before\x1b]2;Title\x07After')).toBe('BeforeAfter')
    })

    it('should strip OSC terminated by ST (ESC \\)', () => {
      expect(strip('\x1b]0;Title\x1b\\Text')).toBe('Text')
      expect(strip('A\x1b]8;;https://example.com\x1b\\link\x1b]8;;\x1b\\B')).toBe('AlinkB')
    })

    it('should strip C1 OSC terminated by C1 ST', () => {
      expect(strip('\u009d0;Title\u009cText')).toBe('Text')
    })

    it('should handle hyperlinks', () => {
      const input = 'Visit \x1b]8;;https://example.com\x1b\\example.com\x1b]8;;\x1b\\ for info'
      expect(strip(input)).toBe('Visit example.com for info')
    })

    it.each(['\x18', '\x1a'])(
      'should recover visible text after %j cancels OSC',
      (cancel) => {
        expect(strip(`Before\x1b]0;Title${cancel}Visible`)).toBe(
          'BeforeVisible'
        )
      }
    )
  })

  describe('DCS sequences (ESC P)', () => {
    it('should not terminate DCS at BEL', () => {
      expect(strip('\x1bP1$rBefore\x07After\x1b\\Text')).toBe('Text')
    })

    it('should strip DCS terminated by ST', () => {
      expect(strip('\x1bP1$rTest\x1b\\After')).toBe('After')
    })

    it('should strip C1 DCS terminated by C1 ST', () => {
      expect(strip('\u00901$rTest\u009cAfter')).toBe('After')
    })
  })

  describe('SOS, PM, and APC sequences', () => {
    it.each([
      '\x1bXpayload\x1b\\Text',
      '\x1b^payload\x1b\\Text',
      '\x1b_payload\x1b\\Text',
      '\u0098payload\u009cText',
      '\u009epayload\u009cText',
      '\u009fpayload\u009cText',
    ])('should strip %j', (input) => {
      expect(strip(input)).toBe('Text')
    })
  })

  describe('Control-string cancellation', () => {
    const stringControls = [
      '\x1b]0;Title',
      '\x1bPpayload',
      '\x1bXpayload',
      '\x1b^payload',
      '\x1b_payload',
    ] as const

    it.each(stringControls)(
      'should reprocess a non-ST ESC after %j',
      (prefix) => {
        expect(strip(`${prefix}\x1b[31mVisible\x1b[0m`)).toBe('Visible')
      }
    )

    it.each(stringControls)(
      'should recover after CAN and SUB cancel %j',
      (prefix) => {
        expect(strip(`${prefix}\x18Visible`)).toBe('Visible')
        expect(strip(`${prefix}\x1aVisible`)).toBe('Visible')
      }
    )

    it('should reprocess a nested C1 introducer', () => {
      expect(strip('\x1b]0;Title\u009b31mVisible\u009b0m')).toBe('Visible')
    })

    it('should recover after every unsupported C1 control cancels a string', () => {
      const supported = new Set([0x90, 0x98, 0x9b, 0x9c, 0x9d, 0x9e, 0x9f])

      for (let code = 0x80; code <= 0x9f; code++) {
        if (supported.has(code)) continue
        const c1 = String.fromCharCode(code)
        expect(strip('Before\x1b]0;Title' + c1 + 'Visible')).toBe(
          'BeforeVisible'
        )
        expect(strip('Before\x1bPpayload' + c1 + 'Visible')).toBe(
          'BeforeVisible'
        )
        expect(strip('Before' + c1 + 'Visible')).toBe(
          'Before' + c1 + 'Visible'
        )
      }
    })

    it('should not preserve a nested CSI as part of a canceled OSC', () => {
      expect(
        strip('\x1b]0;Title\x1b[31mVisible\x1b[0m', {
          preserve: [AnsiType.OSC],
        })
      ).toBe('Visible')
    })
  })

  describe('Simple escape sequences', () => {
    it('should strip simple two-character escapes', () => {
      expect(strip('\x1b7Save cursor')).toBe('Save cursor')
      expect(strip('\x1b8Restore cursor')).toBe('Restore cursor')
      expect(strip('\x1bMReverse index')).toBe('Reverse index')
    })

    it('should strip ESC sequences with intermediate bytes', () => {
      expect(strip('\x1b(BText')).toBe('Text')
      expect(strip('\x1b)0Text')).toBe('Text')

      for (
        let code = ANSI_BYTE_RANGE.ESC_INTERMEDIATE_MIN;
        code <= ANSI_BYTE_RANGE.ESC_INTERMEDIATE_MAX;
        code++
      ) {
        expect(strip(`\x1b${String.fromCharCode(code)}BText`)).toBe('Text')
      }
    })

    it('should reprocess repeated ESC before a valid sequence', () => {
      expect(strip('\x1b\x1b[31mRed')).toBe('Red')
    })
  })

  describe('Mixed sequences', () => {
    it('should strip multiple different sequence types', () => {
      const input = '\x1b[31mRed\x1b]0;Title\x07\x1b[0m Normal \x1bP+q\x1b\\text'
      expect(strip(input)).toBe('Red Normal text')
    })

    it('should handle complex real-world output', () => {
      const input = '\x1b[1;32m✓\x1b[0m Test passed \x1b[2m(10ms)\x1b[0m'
      expect(strip(input)).toBe('✓ Test passed (10ms)')
    })
  })

  describe('Edge cases', () => {
    it('should handle empty string', () => {
      expect(strip('')).toBe('')
    })

    it('should handle string with no ANSI codes', () => {
      expect(strip('Plain text')).toBe('Plain text')
      expect(strip('No codes here!')).toBe('No codes here!')
    })

    it('should handle string with only ANSI codes', () => {
      expect(strip('\x1b[31m\x1b[0m')).toBe('')
      expect(strip('\x1b[1m\x1b[2m\x1b[0m')).toBe('')
    })

    it('should handle consecutive ANSI codes', () => {
      expect(strip('\x1b[1m\x1b[31m\x1b[4mText')).toBe('Text')
    })

    it('should handle malformed sequences gracefully', () => {
      // Incomplete CSI - 'T' is a valid CSI final byte, so '\x1b[T' is stripped
      expect(strip('\x1b[Test')).toBe('est')
      // ESC followed by valid letter - ESC M is "Reverse Index" sequence
      // Valid simple escapes are stripped correctly
      expect(strip('Test\x1bMore')).toBe('Testore')
    })

    it('should preserve Unicode characters', () => {
      expect(strip('\x1b[31m你好\x1b[0m')).toBe('你好')
      expect(strip('\x1b[32m🎉\x1b[0m')).toBe('🎉')
      expect(strip('\x1b[33mΔΦΨ\x1b[0m')).toBe('ΔΦΨ')
    })

    it('should handle very long strings efficiently', () => {
      const longText = 'a'.repeat(10000)
      const input = `\x1b[31m${longText}\x1b[0m`
      expect(strip(input)).toBe(longText)
    })
  })

  describe('Fast path optimization', () => {
    it('should return immediately for strings without ESC', () => {
      const input = 'Plain text without any ANSI codes'
      expect(strip(input)).toBe(input)
    })
  })
})

describe('strip with StripOptions.preserve', () => {
  it('should preserve CSI sequences and strip OSC', () => {
    const input = '\x1b[31mRed\x1b]0;Title\x07\x1b[0m text'
    expect(strip(input, { preserve: [AnsiType.CSI] })).toBe('\x1b[31mRed\x1b[0m text')
  })

  it('should preserve OSC sequences and strip CSI', () => {
    const input = 'Visit \x1b]8;;https://example.com\x1b\\link\x1b]8;;\x1b\\ \x1b[32mhere\x1b[0m'
    expect(strip(input, { preserve: [AnsiType.OSC] })).toBe(
      'Visit \x1b]8;;https://example.com\x1b\\link\x1b]8;;\x1b\\ here'
    )
  })

  it('should preserve multiple types simultaneously', () => {
    const input = '\x1b[31mRed\x1b]0;Title\x07\x1bMSimple\x1b[0m'
    expect(strip(input, { preserve: [AnsiType.CSI, AnsiType.OSC] })).toBe(
      '\x1b[31mRed\x1b]0;Title\x07Simple\x1b[0m'
    )
  })

  it('should strip all when preserve is empty array', () => {
    expect(strip('\x1b[31mRed\x1b[0m text', { preserve: [] })).toBe('Red text')
  })

  it('should handle duplicate preserve values in linear time', () => {
    const preserve = new Array<AnsiType>(10_000).fill(AnsiType.CSI)
    expect(strip('\x1b]0;Title\x07Text', { preserve })).toBe('Text')
  })

  it('should return original string when no ESC even with preserve option', () => {
    expect(strip('Plain text', { preserve: [AnsiType.CSI] })).toBe('Plain text')
  })

  it('should work with stripLines', () => {
    const lines = ['\x1b[31mRed\x1b]0;Title\x07 text\x1b[0m', 'plain']
    expect(stripLines(lines, { preserve: [AnsiType.CSI] })).toEqual([
      '\x1b[31mRed text\x1b[0m',
      'plain',
    ])
  })
})

describe('stripLines', () => {
  it('should strip ANSI from multiple lines', () => {
    const input = [
      '\x1b[31mLine 1\x1b[0m',
      '\x1b[32mLine 2\x1b[0m',
      'Line 3',
    ]
    expect(stripLines(input)).toEqual(['Line 1', 'Line 2', 'Line 3'])
  })

  it('should handle empty array', () => {
    expect(stripLines([])).toEqual([])
  })

  it('should handle array with empty strings', () => {
    expect(stripLines(['', '\x1b[31m\x1b[0m', ''])).toEqual(['', '', ''])
  })

  it('should handle mixed content', () => {
    const input = [
      'Plain line',
      '\x1b[1;32m✓\x1b[0m Passed',
      '\x1b[1;31m✗\x1b[0m Failed',
    ]
    expect(stripLines(input)).toEqual(['Plain line', '✓ Passed', '✗ Failed'])
  })
})
