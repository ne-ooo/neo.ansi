/**
 * Check if string contains ANSI escape codes
 *
 * Fast detection without full parsing.
 */

import { findNextAnsiIndex } from '../core/scanner.js'
import { releaseRegexSubject } from '../core/string-memory.js'

/**
 * Check if string contains ANSI escape codes
 *
 * This is a fast check for the 7-bit ESC introducer and supported 8-bit C1
 * introducers/terminators. It intentionally does not perform full parsing.
 *
 * @param input - Input string to check
 * @returns true if the string contains ESC or a supported C1 control
 *
 * @example
 * ```ts
 * hasAnsi('\x1b[31mRed\x1b[0m')  // => true
 * hasAnsi('Plain text')          // => false
 * hasAnsi('')                    // => false
 * ```
 */
export function hasAnsi(input: string): boolean {
  const result = findNextAnsiIndex(input) !== -1
  releaseRegexSubject(input.length)
  return result
}

/**
 * Check if any string in array contains ANSI codes
 *
 * Convenience function for checking multiple strings.
 * Short-circuits on first match for efficiency.
 *
 * @param inputs - Array of strings to check
 * @returns true if any string contains ANSI codes
 *
 * @example
 * ```ts
 * hasAnsiAny(['Plain', '\x1b[31mRed\x1b[0m', 'Text'])  // => true
 * hasAnsiAny(['Plain', 'Text'])                        // => false
 * ```
 */
export function hasAnsiAny(inputs: string[]): boolean {
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i]
    if (input && hasAnsi(input)) {
      return true
    }
  }
  return false
}

/**
 * Check if all strings in array contain ANSI codes
 *
 * @param inputs - Array of strings to check
 * @returns true if all strings contain ANSI codes
 *
 * @example
 * ```ts
 * hasAnsiAll(['\x1b[31mRed\x1b[0m', '\x1b[32mGreen\x1b[0m'])  // => true
 * hasAnsiAll(['\x1b[31mRed\x1b[0m', 'Plain'])                // => false
 * ```
 */
export function hasAnsiAll(inputs: string[]): boolean {
  if (inputs.length === 0) {
    return false
  }

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i]
    if (!input || !hasAnsi(input)) {
      return false
    }
  }
  return true
}
