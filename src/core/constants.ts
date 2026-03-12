/**
 * ANSI escape code constants based on VT100 specification
 *
 * References:
 * - https://en.wikipedia.org/wiki/ANSI_escape_code
 * - https://vt100.net/docs/vt100-ug/chapter3.html
 * - ECMA-48 standard
 */

/**
 * Character codes for ANSI escape sequences
 */
export const CHAR_CODE = {
  /** ESC - Escape character (0x1B) */
  ESC: 0x1b,
  /** [ - Left bracket for CSI */
  LEFT_BRACKET: 0x5b, // [
  /** ] - Right bracket for OSC */
  RIGHT_BRACKET: 0x5d, // ]
  /** P - Device Control String */
  CAPITAL_P: 0x50, // P
  /** X - SOS (Start of String) */
  CAPITAL_X: 0x58, // X
  /** ^ - PM (Privacy Message) */
  CARET: 0x5e, // ^
  /** _ - APC (Application Program Command) */
  UNDERSCORE: 0x5f, // _
  /** BEL - Bell character (OSC terminator) */
  BEL: 0x07,
  /** ST - String Terminator (ESC \) */
  BACKSLASH: 0x5c, // \
  /** : - Colon (parameter separator in some sequences) */
  COLON: 0x3a, // :
  /** ; - Semicolon (parameter separator) */
  SEMICOLON: 0x3b, // ;
  /** 0 - Zero digit */
  ZERO: 0x30, // 0
  /** 9 - Nine digit */
  NINE: 0x39, // 9
  /** ? - Question mark (private CSI sequences) */
  QUESTION: 0x3f, // ?
  /** @ - At symbol (CSI final byte range start) */
  AT: 0x40, // @
  /** ~ - Tilde (CSI final byte range end) */
  TILDE: 0x7e, // ~
} as const

/**
 * CSI (Control Sequence Introducer) final byte ranges
 *
 * CSI sequences have the format: ESC [ <params> <final>
 * The final byte determines the command type (m for SGR, H for cursor position, etc.)
 */
export const CSI_FINAL_BYTE = {
  /** Minimum final byte (@ = 0x40) */
  MIN: 0x40, // @
  /** Maximum final byte (~ = 0x7e) */
  MAX: 0x7e, // ~
} as const

/**
 * Common CSI final bytes for reference (not used in state machine)
 */
export const CSI_COMMANDS = {
  /** SGR - Select Graphic Rendition (colors, bold, etc.) */
  SGR: 0x6d, // m
  /** CUP - Cursor Position */
  CUP: 0x48, // H
  /** ED - Erase Display */
  ED: 0x4a, // J
  /** EL - Erase Line */
  EL: 0x4b, // K
  /** CUU - Cursor Up */
  CUU: 0x41, // A
  /** CUD - Cursor Down */
  CUD: 0x42, // B
  /** CUF - Cursor Forward */
  CUF: 0x43, // C
  /** CUB - Cursor Back */
  CUB: 0x44, // D
} as const

/**
 * Helper function to check if character code is a digit (0-9)
 *
 * @param code - Character code to check
 * @returns true if code is 0-9
 */
export function isDigit(code: number): boolean {
  return code >= CHAR_CODE.ZERO && code <= CHAR_CODE.NINE
}

/**
 * Helper function to check if character code is a CSI final byte
 *
 * CSI final bytes are in the range @ to ~ (0x40 to 0x7e)
 *
 * @param code - Character code to check
 * @returns true if code is a valid CSI final byte
 */
export function isCsiFinalByte(code: number): boolean {
  return code >= CSI_FINAL_BYTE.MIN && code <= CSI_FINAL_BYTE.MAX
}

/**
 * Helper function to check if character code is a CSI parameter byte
 *
 * Parameter bytes include digits (0-9), semicolon (;), and colon (:)
 *
 * @param code - Character code to check
 * @returns true if code is a valid CSI parameter byte
 */
export function isCsiParamByte(code: number): boolean {
  return (
    isDigit(code) ||
    code === CHAR_CODE.SEMICOLON ||
    code === CHAR_CODE.COLON
  )
}
