/**
 * Avoid retaining attacker-sized source strings through V8 sliced strings or
 * legacy RegExp match state after a public scan operation completes.
 */

import {
  ANSI_INTRODUCER_PATTERN,
  REGEXP_SCAN_THRESHOLD,
} from './constants.js'

export function copyScannedString(value: string): string {
  if (value.length === 0) return ''
  if (value.length <= 4) {
    switch (value.length) {
      case 1:
        return String.fromCharCode(value.charCodeAt(0))
      case 2:
        return String.fromCharCode(value.charCodeAt(0), value.charCodeAt(1))
      case 3:
        return String.fromCharCode(
          value.charCodeAt(0),
          value.charCodeAt(1),
          value.charCodeAt(2)
        )
      default:
        return String.fromCharCode(
          value.charCodeAt(0),
          value.charCodeAt(1),
          value.charCodeAt(2),
          value.charCodeAt(3)
        )
    }
  }

  const midpoint = value.length >>> 1
  return [value.slice(0, midpoint), value.slice(midpoint)].join('')
}

/** Release engine match state after scanning a large RegExp subject. */
export function releaseRegexSubject(
  inputLength: number,
  regexWasUsed = false
): void {
  if (inputLength >= REGEXP_SCAN_THRESHOLD || regexWasUsed) {
    ANSI_INTRODUCER_PATTERN.lastIndex = 0
    ANSI_INTRODUCER_PATTERN.test('\x1b')
  }
}

/** Finalize visible output without retaining a disproportionate large input. */
export function finalizeScannedString(
  inputLength: number,
  output: string,
  outputIsOwned = false,
  detachUnowned = false,
  regexWasUsed = false
): string {
  releaseRegexSubject(inputLength, regexWasUsed)

  return detachUnowned && !outputIsOwned && output.length > 0
    ? copyScannedString(output)
    : output
}

/** Detach a returned substring when it would retain much larger source data. */
export function detachScannedSubstring(
  _inputLength: number,
  value: string
): string {
  return copyScannedString(value)
}
