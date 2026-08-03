/**
 * Strip ANSI escape codes from strings
 *
 * Zero-dependency implementation using allocation-light scanners.
 */

import {
  findNextAnsiIndex,
  findNextC1AnsiIndex,
  scanAnsiSequence,
  scannedSequenceEnd,
  scannedSequenceType,
} from './scanner.js'
import type { StripOptions } from '../types.js'

// The quantified byte classes are disjoint, so this common-CSI expression is
// linear. Complex, malformed, or non-CSI input falls back to the scanner.
const CSI_SEQUENCE_PATTERN = /\x1b\[[0-?]*[ -/]*[@-~]/g

/**
 * Strip the overwhelmingly common ESC-only case without crossing the scanner
 * function boundary for every sequence. Keep this grammar in sync with
 * scanAnsiSequence(); differential tests verify both implementations agree.
 */
function stripEscSequences(input: string, firstSequenceStart: number): string {
  const len = input.length
  let text = ''
  let textStart = 0
  let sequenceStart = firstSequenceStart

  while (sequenceStart !== -1) {
    let cursor = sequenceStart + 1

    if (cursor < len) {
      const code = input.charCodeAt(cursor)

      if (code === 0x5b) {
        // CSI: ESC [ parameter bytes intermediate bytes final byte
        cursor++
        while (cursor < len) {
          const parameter = input.charCodeAt(cursor)
          if (parameter < 0x30 || parameter > 0x3f) break
          cursor++
        }
        while (cursor < len) {
          const intermediate = input.charCodeAt(cursor)
          if (intermediate < 0x20 || intermediate > 0x2f) break
          cursor++
        }
        if (cursor < len) {
          const finalByte = input.charCodeAt(cursor)
          if (finalByte >= 0x40 && finalByte <= 0x7e) cursor++
        }
      } else if (
        code === 0x5d ||
        code === 0x50 ||
        code === 0x58 ||
        code === 0x5e ||
        code === 0x5f
      ) {
        // OSC, DCS, SOS, PM, and APC string controls.
        const isOsc = code === 0x5d
        cursor++
        while (cursor < len) {
          const current = input.charCodeAt(cursor)
          if (isOsc && current === 0x07) {
            cursor++
            break
          }
          if (
            current === 0x1b &&
            cursor + 1 < len &&
            input.charCodeAt(cursor + 1) === 0x5c
          ) {
            cursor += 2
            break
          }
          cursor++
        }
      } else if (code >= 0x30 && code <= 0x7e) {
        // Two-byte ESC sequence.
        cursor++
      } else if (code >= 0x20 && code <= 0x2f) {
        // ESC intermediates followed by an optional final byte.
        do {
          cursor++
        } while (
          cursor < len &&
          input.charCodeAt(cursor) >= 0x20 &&
          input.charCodeAt(cursor) <= 0x2f
        )
        if (cursor < len) {
          const finalByte = input.charCodeAt(cursor)
          if (finalByte >= 0x30 && finalByte <= 0x7e) cursor++
        }
      }
    }

    if (sequenceStart > textStart) {
      text += input.slice(textStart, sequenceStart)
    }
    textStart = cursor
    sequenceStart = input.indexOf('\x1b', cursor)
  }

  return textStart < len ? text + input.slice(textStart) : text
}

/**
 * Strip supported ANSI escape sequences from a string
 *
 * This is the primary function for removing ANSI codes.
 * It handles CSI, string controls, simple ESC sequences, and 8-bit C1 forms.
 *
 * @param input - Input string with ANSI codes
 * @param options - Optional configuration for stripping behavior
 * @returns String with ANSI codes removed
 *
 * @example
 * ```ts
 * strip('\x1b[31mRed text\x1b[0m')
 * // => 'Red text'
 *
 * strip('\x1b[1;32mBold green\x1b[0m text')
 * // => 'Bold green text'
 *
 * strip('Normal \x1b]8;;https://example.com\x1b\\link\x1b]8;;\x1b\\ text')
 * // => 'Normal link text'
 * ```
 */
export function strip(input: string, options?: StripOptions): string {
  const firstEsc = input.indexOf('\x1b')
  const preserve = options?.preserve
  const shouldPreserve = preserve !== undefined && preserve.length > 0

  if (
    !shouldPreserve &&
    firstEsc !== -1 &&
    input.length >= 64 &&
    input.charCodeAt(firstEsc + 1) === 0x5b
  ) {
    const probe = input.slice(firstEsc + 2, firstEsc + 66)
    const nextEsc = probe.indexOf('\x1b')

    if (nextEsc !== -1 && probe.indexOf('\x1b', nextEsc + 2) !== -1) {
      const commonCsiText = input.replace(CSI_SEQUENCE_PATTERN, '')
      if (
        commonCsiText.indexOf('\x1b') === -1 &&
        findNextC1AnsiIndex(commonCsiText) === -1
      ) {
        return commonCsiText
      }
    }
  }

  const firstC1 = findNextC1AnsiIndex(input)
  if (firstEsc === -1 && firstC1 === -1) {
    return input
  }

  if (!shouldPreserve && firstC1 === -1) {
    return stripEscSequences(input, firstEsc)
  }

  const parts: string[] = []
  let cursor = 0
  let sequenceStart =
    firstEsc === -1
      ? firstC1
      : firstC1 === -1
        ? firstEsc
        : Math.min(firstEsc, firstC1)

  while (sequenceStart !== -1) {
    const packed = scanAnsiSequence(input, sequenceStart)
    const end = scannedSequenceEnd(packed)

    if (sequenceStart > cursor) {
      parts.push(input.slice(cursor, sequenceStart))
    }

    if (shouldPreserve && preserve.includes(scannedSequenceType(packed))) {
      parts.push(input.slice(sequenceStart, end))
    }

    cursor = end
    sequenceStart =
      firstC1 === -1
        ? input.indexOf('\x1b', end)
        : findNextAnsiIndex(input, end)
  }

  if (cursor < input.length) {
    parts.push(input.slice(cursor))
  }

  return parts.join('')
}

/**
 * Strip ANSI codes from multiple lines
 *
 * Convenience function for processing multiple lines at once.
 * More efficient than calling strip() on each line separately.
 *
 * @param lines - Array of strings with ANSI codes
 * @param options - Optional configuration for stripping behavior
 * @returns Array of strings with ANSI codes removed
 *
 * @example
 * ```ts
 * stripLines([
 *   '\x1b[31mLine 1\x1b[0m',
 *   '\x1b[32mLine 2\x1b[0m',
 *   'Line 3'
 * ])
 * // => ['Line 1', 'Line 2', 'Line 3']
 * ```
 */
export function stripLines(lines: string[], options?: StripOptions): string[] {
  const result = new Array<string>(lines.length)
  for (let i = 0; i < lines.length; i++) {
    result[i] = strip(lines[i]!, options)
  }
  return result
}
