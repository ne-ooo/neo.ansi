/**
 * Parse ANSI escape sequences and return stripped text plus metadata.
 *
 * Sequence recognition is delegated to the shared allocation-light scanner;
 * this layer allocates detailed objects only for callers that request parse().
 */

import { isCsiPrivateByte } from './constants.js'
import { findNextAnsiIndex, scanAnsiSequences } from './scanner.js'
import {
  copyScannedString,
  detachScannedSubstring,
  finalizeScannedString,
} from './string-memory.js'
import type { AnsiSequence, ParseResult } from '../types.js'
import { AnsiType } from '../types.js'

const METADATA_INPUT_COPY_THRESHOLD = 1024

/**
 * Parse ANSI escape sequences from an input string.
 *
 * @param input - Input string potentially containing ANSI codes
 * @returns Stripped text and sequence metadata
 */
export function parse(input: string): ParseResult {
  const firstSequenceStart = findNextAnsiIndex(input)
  if (firstSequenceStart === -1) {
    return {
      text: finalizeScannedString(input.length, input),
      sequences: [],
    }
  }

  const detachMetadata = input.length >= METADATA_INPUT_COPY_THRESHOLD
  const source = detachMetadata ? input : copyScannedString(input)
  const sequences: AnsiSequence[] = []
  const textParts: string[] = []
  let textStart = 0

  scanAnsiSequences(
    source,
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
        textParts.push(source.slice(textStart, start))
      }

      if (type === AnsiType.CSI) {
        const parameterValue = source.slice(parameterStart, parameterEnd)
        const parameterBytes = detachMetadata
          ? detachScannedSubstring(input.length, parameterValue)
          : parameterValue
        const intermediateValue = source.slice(
          intermediateStart,
          intermediateEnd
        )
        const intermediateBytes = detachMetadata
          ? detachScannedSubstring(input.length, intermediateValue)
          : intermediateValue
        let privateMarkerEnd = 0

        while (
          privateMarkerEnd < parameterBytes.length &&
          isCsiPrivateByte(parameterBytes.charCodeAt(privateMarkerEnd))
        ) {
          privateMarkerEnd++
        }

        const privateMarkerValue = parameterBytes.slice(0, privateMarkerEnd)
        const privateMarker = detachMetadata
          ? detachScannedSubstring(input.length, privateMarkerValue)
          : privateMarkerValue
        const parameterData = parameterBytes.slice(privateMarkerEnd)
        const params =
          parameterData.length === 0
            ? []
            : detachMetadata
              ? parameterData
                  .split(';')
                  .map((parameter) =>
                    detachScannedSubstring(input.length, parameter)
                  )
              : parameterData.split(';')
        const rawValue = source.slice(start, end)
        const finalValue = source.charAt(finalIndex)

        sequences.push({
          type,
          raw: detachMetadata
            ? detachScannedSubstring(input.length, rawValue)
            : rawValue,
          start,
          end,
          params,
          parameterBytes,
          intermediateBytes,
          ...(privateMarker.length > 0 ? { privateMarker } : {}),
          final: detachMetadata
            ? detachScannedSubstring(input.length, finalValue)
            : finalValue,
        })
      } else {
        const rawValue = source.slice(start, end)
        sequences.push({
          type,
          raw: detachMetadata
            ? detachScannedSubstring(input.length, rawValue)
            : rawValue,
          start,
          end,
        })
      }

      textStart = end
    }
  )

  if (textStart < source.length) {
    textParts.push(source.slice(textStart))
  }

  return {
    text: finalizeScannedString(
      input.length,
      textParts.join(''),
      textParts.length > 1,
      detachMetadata
    ),
    sequences,
  }
}
