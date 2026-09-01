/**
 * Unit tests for constants and helper functions
 */

import { describe, it, expect } from 'vitest'
import {
  ANSI_BYTE_RANGE,
  CHAR_CODE,
  isAnsiC1Code,
  isDigit,
  isCsiFinalByte,
  isCsiIntermediateByte,
  isCsiParamByte,
  isCsiPrivateByte,
  isEscapeFinalByte,
  isEscapeIntermediateByte,
} from '../../src/core/constants.js'

describe('Character code constants', () => {
  it('should have correct ESC character code', () => {
    expect(CHAR_CODE.CAN).toBe(0x18)
    expect(CHAR_CODE.SUB).toBe(0x1a)
    expect(CHAR_CODE.ESC).toBe(0x1b)
    expect(String.fromCharCode(CHAR_CODE.ESC)).toBe('\x1b')
  })

  it('should have correct bracket codes', () => {
    expect(CHAR_CODE.LEFT_BRACKET).toBe('['.charCodeAt(0))
    expect(CHAR_CODE.RIGHT_BRACKET).toBe(']'.charCodeAt(0))
  })

  it('should have correct digit range', () => {
    expect(CHAR_CODE.ZERO).toBe('0'.charCodeAt(0))
    expect(CHAR_CODE.NINE).toBe('9'.charCodeAt(0))
  })
})

describe('isDigit', () => {
  it('should return true for digit character codes', () => {
    expect(isDigit('0'.charCodeAt(0))).toBe(true)
    expect(isDigit('5'.charCodeAt(0))).toBe(true)
    expect(isDigit('9'.charCodeAt(0))).toBe(true)
  })

  it('should return false for non-digit character codes', () => {
    expect(isDigit('a'.charCodeAt(0))).toBe(false)
    expect(isDigit('A'.charCodeAt(0))).toBe(false)
    expect(isDigit(';'.charCodeAt(0))).toBe(false)
    expect(isDigit(' '.charCodeAt(0))).toBe(false)
  })

  it('should handle boundary cases', () => {
    // '0' - 1 = '/' (not a digit)
    expect(isDigit('0'.charCodeAt(0) - 1)).toBe(false)
    // '9' + 1 = ':' (not a digit)
    expect(isDigit('9'.charCodeAt(0) + 1)).toBe(false)
  })
})

describe('isCsiFinalByte', () => {
  it('should return true for valid CSI final bytes', () => {
    // Common CSI final bytes
    expect(isCsiFinalByte('m'.charCodeAt(0))).toBe(true) // SGR
    expect(isCsiFinalByte('H'.charCodeAt(0))).toBe(true) // CUP
    expect(isCsiFinalByte('J'.charCodeAt(0))).toBe(true) // ED
    expect(isCsiFinalByte('K'.charCodeAt(0))).toBe(true) // EL
    expect(isCsiFinalByte('A'.charCodeAt(0))).toBe(true) // CUU
  })

  it('should return true for boundary final bytes', () => {
    expect(isCsiFinalByte('@'.charCodeAt(0))).toBe(true) // 0x40 (min)
    expect(isCsiFinalByte('~'.charCodeAt(0))).toBe(true) // 0x7e (max)
  })

  it('should return false for non-final bytes', () => {
    expect(isCsiFinalByte('0'.charCodeAt(0))).toBe(false)
    expect(isCsiFinalByte(';'.charCodeAt(0))).toBe(false)
    expect(isCsiFinalByte('?'.charCodeAt(0))).toBe(false)
  })

  it('should handle boundary cases', () => {
    // '@' - 1 = '?' (not final)
    expect(isCsiFinalByte('@'.charCodeAt(0) - 1)).toBe(false)
    // '~' + 1 (out of range)
    expect(isCsiFinalByte('~'.charCodeAt(0) + 1)).toBe(false)
  })
})

describe('isCsiParamByte', () => {
  it('should return true for digits', () => {
    expect(isCsiParamByte('0'.charCodeAt(0))).toBe(true)
    expect(isCsiParamByte('5'.charCodeAt(0))).toBe(true)
    expect(isCsiParamByte('9'.charCodeAt(0))).toBe(true)
  })

  it('should return true for separators', () => {
    expect(isCsiParamByte(';'.charCodeAt(0))).toBe(true) // semicolon
    expect(isCsiParamByte(':'.charCodeAt(0))).toBe(true) // colon
  })

  it('should return true for the complete ECMA-48 parameter range', () => {
    for (
      let code = ANSI_BYTE_RANGE.CSI_PARAMETER_MIN;
      code <= ANSI_BYTE_RANGE.CSI_PARAMETER_MAX;
      code++
    ) {
      expect(isCsiParamByte(code)).toBe(true)
    }
  })

  it('should return false for non-parameter bytes', () => {
    expect(isCsiParamByte('m'.charCodeAt(0))).toBe(false) // final byte
    expect(isCsiParamByte('?'.charCodeAt(0))).toBe(true) // private marker
    expect(isCsiParamByte(' '.charCodeAt(0))).toBe(false) // space
    expect(isCsiParamByte('a'.charCodeAt(0))).toBe(false) // letter
  })
})

describe('ESC and CSI byte classes', () => {
  it('should recognize intermediate bytes', () => {
    expect(isCsiIntermediateByte(' '.charCodeAt(0))).toBe(true)
    expect(isCsiIntermediateByte('/'.charCodeAt(0))).toBe(true)
    expect(isEscapeIntermediateByte('('.charCodeAt(0))).toBe(true)
    expect(isEscapeIntermediateByte('/'.charCodeAt(0))).toBe(true)
    expect(isCsiIntermediateByte('0'.charCodeAt(0))).toBe(false)
  })

  it('should recognize CSI private-marker bytes', () => {
    for (const marker of ['<', '=', '>', '?']) {
      expect(isCsiPrivateByte(marker.charCodeAt(0))).toBe(true)
    }

    expect(isCsiPrivateByte(';'.charCodeAt(0))).toBe(false)
    expect(isCsiPrivateByte('@'.charCodeAt(0))).toBe(false)
  })

  it('should recognize ESC final bytes', () => {
    expect(isEscapeFinalByte('0'.charCodeAt(0))).toBe(true)
    expect(isEscapeFinalByte('M'.charCodeAt(0))).toBe(true)
    expect(isEscapeFinalByte('~'.charCodeAt(0))).toBe(true)
    expect(isEscapeFinalByte('/'.charCodeAt(0))).toBe(false)
  })
})

describe('C1 controls', () => {
  it('should recognize every supported C1 introducer and ST', () => {
    for (const code of [
      CHAR_CODE.C1_CSI,
      CHAR_CODE.C1_OSC,
      CHAR_CODE.C1_DCS,
      CHAR_CODE.C1_SOS,
      CHAR_CODE.C1_PM,
      CHAR_CODE.C1_APC,
      CHAR_CODE.C1_ST,
    ]) {
      expect(isAnsiC1Code(code)).toBe(true)
    }

    expect(isAnsiC1Code(0x91)).toBe(false)
  })
})
