/**
 * @lpm.dev/neo.ansi - Modern ANSI escape code parser and stripper
 *
 * Zero runtime dependencies with linear-time sequence recognition
 *
 * @example
 * ```ts
 * import { strip, hasAnsi, parse } from '@lpm.dev/neo.ansi'
 *
 * // Strip ANSI codes
 * strip('\x1b[31mRed text\x1b[0m')  // => 'Red text'
 *
 * // Check for ANSI codes
 * hasAnsi('\x1b[31mRed\x1b[0m')     // => true
 *
 * // Parse ANSI sequences
 * const result = parse('\x1b[31mRed\x1b[0m')
 * // result.text = 'Red'
 * // result.sequences = [{ type: 'csi', raw: '\x1b[31m', ... }, ...]
 * ```
 */

// Core functions
export { strip, stripLines } from './core/strip.js'
export { createStreamingStripper } from './core/stream.js'
export { parse } from './core/state-machine.js'

// Utility functions
export { hasAnsi, hasAnsiAny, hasAnsiAll } from './utils/has-ansi.js'

// Types
export type {
  AnsiSequence,
  ParseResult,
  StripOptions,
  StreamingStripper,
} from './types.js'

export { AnsiType, ParserState } from './types.js'

// Constants (for advanced use cases)
export {
  CHAR_CODE,
  ANSI_BYTE_RANGE,
  CSI_FINAL_BYTE,
  CSI_COMMANDS,
  isDigit,
  isCsiFinalByte,
  isCsiParamByte,
  isCsiPrivateByte,
  isCsiIntermediateByte,
  isEscapeIntermediateByte,
  isEscapeFinalByte,
  isAnsiC1Code,
} from './core/constants.js'
