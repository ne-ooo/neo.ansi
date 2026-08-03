/**
 * Parse ANSI escape sequences and return stripped text plus metadata.
 *
 * Sequence recognition is delegated to the shared allocation-light scanner;
 * this layer allocates detailed objects only for callers that request parse().
 */

import { isCsiPrivateByte } from './constants.js'
import { findNextAnsiIndex, scanAnsiSequences } from './scanner.js'
import type { AnsiSequence, ParseResult } from '../types.js'
import { AnsiType } from '../types.js'

/**
 * Parse ANSI escape sequences from an input string.
 *
 * @param input - Input string potentially containing ANSI codes
 * @returns Stripped text and sequence metadata
 */
export function parse(input: string): ParseResult {
  const firstSequenceStart = findNextAnsiIndex(input)
  if (firstSequenceStart === -1) {
    return { text: input, sequences: [] }
  }

  const sequences: AnsiSequence[] = []
  const textParts: string[] = []
  let textStart = 0

  scanAnsiSequences(
    input,
    firstSequenceStart,
    (
      type,
      start,
      end,
      parameterStart,
      parameterEnd,
      intermediateStart,
      intermediateEnd,
      finalIndex
    ) => {
      if (start > textStart) {
        textParts.push(input.slice(textStart, start))
      }

      if (type === AnsiType.CSI) {
        const parameterBytes = input.slice(parameterStart, parameterEnd)
        const intermediateBytes = input.slice(
          intermediateStart,
          intermediateEnd
        )
        let privateMarkerEnd = 0

        while (
          privateMarkerEnd < parameterBytes.length &&
          isCsiPrivateByte(parameterBytes.charCodeAt(privateMarkerEnd))
        ) {
          privateMarkerEnd++
        }

        const privateMarker = parameterBytes.slice(0, privateMarkerEnd)
        const parameterData = parameterBytes.slice(privateMarkerEnd)

        sequences.push({
          type,
          raw: input.slice(start, end),
          start,
          end,
          params: parameterData.length === 0 ? [] : parameterData.split(';'),
          parameterBytes,
          intermediateBytes,
          ...(privateMarker.length > 0 ? { privateMarker } : {}),
          final: input.charAt(finalIndex),
        })
      } else {
        sequences.push({
          type,
          raw: input.slice(start, end),
          start,
          end,
        })
      }

      textStart = end
    }
  )

  if (textStart < input.length) {
    textParts.push(input.slice(textStart))
  }

  return {
    text: textParts.join(''),
    sequences,
  }
}
