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
  /** C1 DCS - 8-bit Device Control String introducer */
  C1_DCS: 0x90,
  /** C1 SOS - 8-bit Start of String introducer */
  C1_SOS: 0x98,
  /** C1 CSI - 8-bit Control Sequence Introducer */
  C1_CSI: 0x9b,
  /** C1 ST - 8-bit String Terminator */
  C1_ST: 0x9c,
  /** C1 OSC - 8-bit Operating System Command introducer */
  C1_OSC: 0x9d,
  /** C1 PM - 8-bit Privacy Message introducer */
  C1_PM: 0x9e,
  /** C1 APC - 8-bit Application Program Command introducer */
  C1_APC: 0x9f,
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
 * ECMA-48 byte ranges used by ESC and CSI sequences.
 */
export const ANSI_BYTE_RANGE = {
  /** ESC intermediate bytes */
  ESC_INTERMEDIATE_MIN: 0x20,
  ESC_INTERMEDIATE_MAX: 0x2f,
  /** ESC final bytes */
  ESC_FINAL_MIN: 0x30,
  ESC_FINAL_MAX: 0x7e,
  /** CSI parameter bytes */
  CSI_PARAMETER_MIN: 0x30,
  CSI_PARAMETER_MAX: 0x3f,
  /** CSI private-marker bytes (<, =, >, ?) */
  CSI_PRIVATE_MIN: 0x3c,
  CSI_PRIVATE_MAX: 0x3f,
  /** CSI intermediate bytes */
  CSI_INTERMEDIATE_MIN: 0x20,
  CSI_INTERMEDIATE_MAX: 0x2f,
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
 * ECMA-48 parameter bytes occupy the complete 0x30-0x3f range. This includes
 * digits, separators, and private markers such as <, =, >, and ?.
 *
 * @param code - Character code to check
 * @returns true if code is a valid CSI parameter byte
 */
export function isCsiParamByte(code: number): boolean {
  return (
    code >= ANSI_BYTE_RANGE.CSI_PARAMETER_MIN &&
    code <= ANSI_BYTE_RANGE.CSI_PARAMETER_MAX
  )
}

/** Check whether a character code is a CSI private-marker byte. */
export function isCsiPrivateByte(code: number): boolean {
  return (
    code >= ANSI_BYTE_RANGE.CSI_PRIVATE_MIN &&
    code <= ANSI_BYTE_RANGE.CSI_PRIVATE_MAX
  )
}

/** Check whether a character code is a CSI intermediate byte. */
export function isCsiIntermediateByte(code: number): boolean {
  return (
    code >= ANSI_BYTE_RANGE.CSI_INTERMEDIATE_MIN &&
    code <= ANSI_BYTE_RANGE.CSI_INTERMEDIATE_MAX
  )
}

/** Check whether a character code is an ESC intermediate byte. */
export function isEscapeIntermediateByte(code: number): boolean {
  return (
    code >= ANSI_BYTE_RANGE.ESC_INTERMEDIATE_MIN &&
    code <= ANSI_BYTE_RANGE.ESC_INTERMEDIATE_MAX
  )
}

/** Check whether a character code is an ESC final byte. */
export function isEscapeFinalByte(code: number): boolean {
  return (
    code >= ANSI_BYTE_RANGE.ESC_FINAL_MIN &&
    code <= ANSI_BYTE_RANGE.ESC_FINAL_MAX
  )
}

/** Check whether a character code introduces or terminates a C1 sequence. */
export function isAnsiC1Code(code: number): boolean {
  return (
    code === CHAR_CODE.C1_CSI ||
    code === CHAR_CODE.C1_OSC ||
    code === CHAR_CODE.C1_DCS ||
    code === CHAR_CODE.C1_SOS ||
    code === CHAR_CODE.C1_PM ||
    code === CHAR_CODE.C1_APC ||
    code === CHAR_CODE.C1_ST
  )
}
