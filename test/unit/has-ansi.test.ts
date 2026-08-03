/**
 * Unit tests for hasAnsi() functions
 */

import { describe, it, expect } from 'vitest'
import { hasAnsi, hasAnsiAny, hasAnsiAll } from '../../src/utils/has-ansi.js'

describe('hasAnsi', () => {
  it('should return true for strings with ANSI codes', () => {
    expect(hasAnsi('\x1b[31mRed\x1b[0m')).toBe(true)
    expect(hasAnsi('\x1b[1mBold')).toBe(true)
    expect(hasAnsi('Text \x1b[32mGreen')).toBe(true)
  })

  it('should return false for plain strings', () => {
    expect(hasAnsi('Plain text')).toBe(false)
    expect(hasAnsi('No codes here')).toBe(false)
    expect(hasAnsi('')).toBe(false)
  })

  it('should handle CSI sequences', () => {
    expect(hasAnsi('\x1b[31mRed')).toBe(true)
    expect(hasAnsi('\x1b[1;2;3m')).toBe(true)
  })

  it('should handle OSC sequences', () => {
    expect(hasAnsi('\x1b]0;Title\x07')).toBe(true)
    expect(hasAnsi('\x1b]8;;url\x1b\\')).toBe(true)
  })

  it('should handle DCS sequences', () => {
    expect(hasAnsi('\x1bP1$r\x07')).toBe(true)
  })

  it('should detect 8-bit C1 forms', () => {
    expect(hasAnsi('\u009b31mRed\u009b0m')).toBe(true)
    expect(hasAnsi('\u009d0;Title\u009c')).toBe(true)
    expect(hasAnsi('\u0090payload\u009c')).toBe(true)
    expect(hasAnsi('\u0098payload\u009c')).toBe(true)
    expect(hasAnsi('\u009epayload\u009c')).toBe(true)
    expect(hasAnsi('\u009fpayload\u009c')).toBe(true)
    expect(hasAnsi('\u009c')).toBe(true)
  })

  it('should handle simple escapes', () => {
    expect(hasAnsi('\x1b7')).toBe(true)
    expect(hasAnsi('\x1b8')).toBe(true)
  })

  it('should be fast for strings without ANSI', () => {
    // Fast path using string.includes()
    const longText = 'a'.repeat(10000)
    expect(hasAnsi(longText)).toBe(false)
  })
})

describe('hasAnsiAny', () => {
  it('should return true if any string has ANSI', () => {
    expect(hasAnsiAny(['Plain', '\x1b[31mRed\x1b[0m', 'Text'])).toBe(true)
    expect(hasAnsiAny(['\x1b[31mRed\x1b[0m'])).toBe(true)
    expect(hasAnsiAny(['Plain', 'Plain', '\x1b[31mRed\x1b[0m'])).toBe(true)
  })

  it('should return false if no strings have ANSI', () => {
    expect(hasAnsiAny(['Plain', 'Text'])).toBe(false)
    expect(hasAnsiAny([''])).toBe(false)
    expect(hasAnsiAny([])).toBe(false)
  })

  it('should short-circuit on first match', () => {
    // First element has ANSI, should not check rest
    const array = ['\x1b[31mRed\x1b[0m', 'Plain 1', 'Plain 2']
    expect(hasAnsiAny(array)).toBe(true)
  })

  it('should handle empty strings in array', () => {
    expect(hasAnsiAny(['', '', '\x1b[31mRed\x1b[0m'])).toBe(true)
    expect(hasAnsiAny(['', '', ''])).toBe(false)
  })
})

describe('hasAnsiAll', () => {
  it('should return true if all strings have ANSI', () => {
    expect(
      hasAnsiAll(['\x1b[31mRed\x1b[0m', '\x1b[32mGreen\x1b[0m'])
    ).toBe(true)
    expect(hasAnsiAll(['\x1b[31mRed\x1b[0m'])).toBe(true)
  })

  it('should return false if any string lacks ANSI', () => {
    expect(hasAnsiAll(['\x1b[31mRed\x1b[0m', 'Plain'])).toBe(false)
    expect(hasAnsiAll(['Plain', '\x1b[31mRed\x1b[0m'])).toBe(false)
    expect(hasAnsiAll(['Plain'])).toBe(false)
  })

  it('should return false for empty array', () => {
    expect(hasAnsiAll([])).toBe(false)
  })

  it('should return false if any string is empty', () => {
    expect(hasAnsiAll(['\x1b[31mRed\x1b[0m', ''])).toBe(false)
    expect(hasAnsiAll(['', '\x1b[31mRed\x1b[0m'])).toBe(false)
  })

  it('should handle all strings with ANSI', () => {
    expect(
      hasAnsiAll([
        '\x1b[31mRed\x1b[0m',
        '\x1b[32mGreen\x1b[0m',
        '\x1b[33mYellow\x1b[0m',
      ])
    ).toBe(true)
  })
})
