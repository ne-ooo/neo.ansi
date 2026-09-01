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
import {
  isAnsiC1Code,
  OSC_STRING_CANDIDATE_PATTERN,
  STRING_CANDIDATE_PATTERN,
  STRING_SEARCH_THRESHOLD,
} from './constants.js'
import { finalizeScannedString } from './string-memory.js'
import type { StripOptions } from '../types.js'
import { AnsiType } from '../types.js'

const MAX_CONCATENATED_TEXT_PARTS = 256

function ansiTypeBit(type: AnsiType): number {
  switch (type) {
    case AnsiType.CSI:
      return 1 << 0
    case AnsiType.OSC:
      return 1 << 1
    case AnsiType.DCS:
      return 1 << 2
    case AnsiType.SOS:
      return 1 << 3
    case AnsiType.PM:
      return 1 << 4
    case AnsiType.APC:
      return 1 << 5
    case AnsiType.Simple:
      return 1 << 6
    case AnsiType.Unknown:
      return 1 << 7
  }
}

function createPreserveMask(preserve: readonly AnsiType[] | undefined): number {
  let mask = 0
  if (!preserve) return mask

  for (let i = 0; i < preserve.length; i++) {
    const type = preserve[i]
    if (type !== undefined) mask |= ansiTypeBit(type)
  }

  return mask
}

/**
 * Strip the overwhelmingly common ESC-only case without crossing the scanner
 * function boundary for every sequence. Keep this grammar in sync with
 * scanAnsiSequence(); differential tests verify both implementations agree.
 */
function stripEscSequences(input: string, firstSequenceStart: number): string {
  const len = input.length
  let text = ''
  let textPartCount = 0
  let parts: string[] | undefined
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
          if (len >= 256 && len - cursor >= STRING_SEARCH_THRESHOLD) {
            const pattern = isOsc
              ? OSC_STRING_CANDIDATE_PATTERN
              : STRING_CANDIDATE_PATTERN
            pattern.lastIndex = cursor
            if (!pattern.test(input)) {
              cursor = len
              break
            }
            cursor = pattern.lastIndex - 1
          }

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
          if (current === 0x18 || current === 0x1a) {
            cursor++
            break
          }
          if (current === 0x1b) {
            // Reprocess a non-ST ESC as the start of a new sequence.
            break
          }
          if (current >= 0x80 && current <= 0x9f) {
            // Every C1 control cancels the string. Supported C1 controls use
            // the general scanner; consume unsupported controls here.
            cursor++
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
      const part = input.slice(textStart, sequenceStart)
      if (parts) {
        parts.push(part)
      } else if (textPartCount < MAX_CONCATENATED_TEXT_PARTS) {
        text += part
        textPartCount++
      } else {
        parts = [text, part]
        text = ''
      }
    }
    textStart = cursor
    sequenceStart = input.indexOf('\x1b', cursor)
  }

  if (textStart < len) {
    const part = input.slice(textStart)
    if (parts) {
      parts.push(part)
    } else if (textPartCount < MAX_CONCATENATED_TEXT_PARTS) {
      text += part
    } else {
      parts = [text, part]
    }
  }

  return parts
    ? finalizeScannedString(input.length, parts.join(''), true, true)
    : finalizeScannedString(input.length, text, false, true)
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
  const firstCode = input.charCodeAt(0)
  const firstAnsi =
    firstCode === 0x1b || isAnsiC1Code(firstCode)
      ? 0
      : findNextAnsiIndex(input)
  if (firstAnsi === -1) return finalizeScannedString(input.length, input)

  const firstIsEsc = input.charCodeAt(firstAnsi) === 0x1b
  const firstEsc = firstIsEsc
    ? firstAnsi
    : input.indexOf('\x1b', firstAnsi + 1)
  const preserveMask = createPreserveMask(options?.preserve)
  const shouldPreserve = preserveMask !== 0

  const firstC1 = firstIsEsc
    ? findNextC1AnsiIndex(input, firstAnsi + 1)
    : firstAnsi

  if (!shouldPreserve && firstC1 === -1) {
    return stripEscSequences(input, firstEsc)
  }

  const parts: string[] = []
  let cursor = 0
  let sequenceStart = firstAnsi

  while (sequenceStart !== -1) {
    const packed = scanAnsiSequence(input, sequenceStart)
    const end = scannedSequenceEnd(packed)

    if (sequenceStart > cursor) {
      parts.push(input.slice(cursor, sequenceStart))
    }

    if (
      shouldPreserve &&
      (preserveMask & ansiTypeBit(scannedSequenceType(packed))) !== 0
    ) {
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

  return finalizeScannedString(
    input.length,
    parts.join(''),
    parts.length > 1,
    true
  )
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
