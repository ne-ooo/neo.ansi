/**
 * Unit tests for strip() function
 */

import { describe, it, expect } from 'vitest'
import { strip, stripLines } from '../../src/core/strip.js'
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

    it('should handle CSI with parameters', () => {
      expect(strip('\x1b[38;5;196mRed\x1b[0m')).toBe('Red')
      expect(strip('\x1b[1;2;3;4;5mMany params\x1b[0m')).toBe('Many params')
    })

    it('should handle CSI with private markers', () => {
      expect(strip('\x1b[?25hShow cursor')).toBe('Show cursor')
      expect(strip('\x1b[?1049hAlt buffer')).toBe('Alt buffer')
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

    it('should handle hyperlinks', () => {
      const input = 'Visit \x1b]8;;https://example.com\x1b\\example.com\x1b]8;;\x1b\\ for info'
      expect(strip(input)).toBe('Visit example.com for info')
    })
  })

  describe('DCS sequences (ESC P)', () => {
    it('should strip DCS terminated by BEL', () => {
      expect(strip('\x1bP1$rTest\x07After')).toBe('After')
    })

    it('should strip DCS terminated by ST', () => {
      expect(strip('\x1bP1$rTest\x1b\\After')).toBe('After')
    })
  })

  describe('Simple escape sequences', () => {
    it('should strip simple two-character escapes', () => {
      expect(strip('\x1b7Save cursor')).toBe('Save cursor')
      expect(strip('\x1b8Restore cursor')).toBe('Restore cursor')
      expect(strip('\x1bMReverse index')).toBe('Reverse index')
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
