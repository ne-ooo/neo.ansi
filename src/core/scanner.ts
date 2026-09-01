/**
 * Allocation-light ANSI sequence scanner.
 *
 * Native string searches jump between possible introducers while the sequence
 * grammar itself is recognized with bounded, forward-only loops.
 */

import {
  ANSI_INTRODUCER_PATTERN,
  C1_ANSI_PATTERN,
  CHAR_CODE,
  isCsiFinalByte,
  isCsiIntermediateByte,
  isCsiParamByte,
  isAnsiC1Code,
  isEscapeFinalByte,
  isEscapeIntermediateByte,
  OSC_STRING_CANDIDATE_PATTERN,
  REGEXP_SCAN_THRESHOLD,
  STRING_CANDIDATE_PATTERN,
  STRING_SEARCH_THRESHOLD,
} from './constants.js'
import { AnsiType } from '../types.js'

const SCAN_TYPE_COUNT = 8

const SCAN_TYPE = {
  Unknown: 0,
  CSI: 1,
  OSC: 2,
  DCS: 3,
  SOS: 4,
  PM: 5,
  APC: 6,
  Simple: 7,
} as const

export type AnsiSequenceVisitor = (
  type: AnsiType,
  start: number,
  end: number,
  parameterStart: number,
  parameterEnd: number,
  intermediateStart: number,
  intermediateEnd: number,
  finalIndex: number
) => void

/** Find the next supported ESC/C1 introducer at or after `fromIndex`. */
export function findNextAnsiIndex(input: string, fromIndex = 0): number {
  if (input.length - fromIndex < REGEXP_SCAN_THRESHOLD) {
    for (let index = fromIndex; index < input.length; index++) {
      const code = input.charCodeAt(index)
      if (code === CHAR_CODE.ESC || isAnsiC1Code(code)) return index
    }
    return -1
  }

  ANSI_INTRODUCER_PATTERN.lastIndex = fromIndex
  if (fromIndex === 0) {
    const match = ANSI_INTRODUCER_PATTERN.exec(input)
    return match?.index ?? -1
  }
  return ANSI_INTRODUCER_PATTERN.test(input)
    ? ANSI_INTRODUCER_PATTERN.lastIndex - 1
    : -1
}

/** Find the next supported 8-bit C1 control at or after `fromIndex`. */
export function findNextC1AnsiIndex(input: string, fromIndex = 0): number {
  if (input.length - fromIndex < REGEXP_SCAN_THRESHOLD) {
    for (let index = fromIndex; index < input.length; index++) {
      if (isAnsiC1Code(input.charCodeAt(index))) return index
    }
    return -1
  }

  C1_ANSI_PATTERN.lastIndex = fromIndex
  return C1_ANSI_PATTERN.test(input) ? C1_ANSI_PATTERN.lastIndex - 1 : -1
}

/** Decode the sequence end from the packed scanner result. */
export function scannedSequenceEnd(packed: number): number {
  const type = packed % SCAN_TYPE_COUNT
  return (packed - type) / SCAN_TYPE_COUNT
}

/** Decode the public sequence type from the packed scanner result. */
export function scannedSequenceType(packed: number): AnsiType {
  switch (packed % SCAN_TYPE_COUNT) {
    case SCAN_TYPE.CSI:
      return AnsiType.CSI
    case SCAN_TYPE.OSC:
      return AnsiType.OSC
    case SCAN_TYPE.DCS:
      return AnsiType.DCS
    case SCAN_TYPE.SOS:
      return AnsiType.SOS
    case SCAN_TYPE.PM:
      return AnsiType.PM
    case SCAN_TYPE.APC:
      return AnsiType.APC
    case SCAN_TYPE.Simple:
      return AnsiType.Simple
    default:
      return AnsiType.Unknown
  }
}

function packSequence(end: number, type: number): number {
  return end * SCAN_TYPE_COUNT + type
}

/**
 * Scan one sequence and return its end offset and type in a packed number.
 * Packing avoids allocating a tuple/object on the hot strip path.
 */
export function scanAnsiSequence(input: string, start: number): number {
  const len = input.length
  const introducer = input.charCodeAt(start)
  let cursor = start + 1
  let csiStart = -1
  let stringType: number = SCAN_TYPE.Unknown

  if (introducer === CHAR_CODE.ESC) {
    if (cursor >= len) {
      return packSequence(cursor, SCAN_TYPE.Unknown)
    }

    const code = input.charCodeAt(cursor)
    if (code === CHAR_CODE.LEFT_BRACKET) {
      csiStart = cursor + 1
    } else if (code === CHAR_CODE.RIGHT_BRACKET) {
      stringType = SCAN_TYPE.OSC
      cursor++
    } else if (code === CHAR_CODE.CAPITAL_P) {
      stringType = SCAN_TYPE.DCS
      cursor++
    } else if (code === CHAR_CODE.CAPITAL_X) {
      stringType = SCAN_TYPE.SOS
      cursor++
    } else if (code === CHAR_CODE.CARET) {
      stringType = SCAN_TYPE.PM
      cursor++
    } else if (code === CHAR_CODE.UNDERSCORE) {
      stringType = SCAN_TYPE.APC
      cursor++
    } else if (isEscapeFinalByte(code)) {
      return packSequence(cursor + 1, SCAN_TYPE.Simple)
    } else if (isEscapeIntermediateByte(code)) {
      while (
        cursor < len &&
        isEscapeIntermediateByte(input.charCodeAt(cursor))
      ) {
        cursor++
      }

      return cursor < len && isEscapeFinalByte(input.charCodeAt(cursor))
        ? packSequence(cursor + 1, SCAN_TYPE.Simple)
        : packSequence(cursor, SCAN_TYPE.Unknown)
    } else {
      // Strip only the ESC and let the caller search again from this byte.
      return packSequence(cursor, SCAN_TYPE.Unknown)
    }
  } else {
    switch (introducer) {
      case CHAR_CODE.C1_CSI:
        csiStart = cursor
        break
      case CHAR_CODE.C1_OSC:
        stringType = SCAN_TYPE.OSC
        break
      case CHAR_CODE.C1_DCS:
        stringType = SCAN_TYPE.DCS
        break
      case CHAR_CODE.C1_SOS:
        stringType = SCAN_TYPE.SOS
        break
      case CHAR_CODE.C1_PM:
        stringType = SCAN_TYPE.PM
        break
      case CHAR_CODE.C1_APC:
        stringType = SCAN_TYPE.APC
        break
      case CHAR_CODE.C1_ST:
        return packSequence(cursor, SCAN_TYPE.Simple)
    }
  }

  if (csiStart !== -1) {
    cursor = csiStart
    while (cursor < len && isCsiParamByte(input.charCodeAt(cursor))) {
      cursor++
    }
    while (cursor < len && isCsiIntermediateByte(input.charCodeAt(cursor))) {
      cursor++
    }

    return cursor < len && isCsiFinalByte(input.charCodeAt(cursor))
      ? packSequence(cursor + 1, SCAN_TYPE.CSI)
      : packSequence(cursor, SCAN_TYPE.Unknown)
  }

  if (stringType !== SCAN_TYPE.Unknown) {
    while (cursor < len) {
      if (
        len >= REGEXP_SCAN_THRESHOLD &&
        len - cursor >= STRING_SEARCH_THRESHOLD
      ) {
        const pattern =
          stringType === SCAN_TYPE.OSC
            ? OSC_STRING_CANDIDATE_PATTERN
            : STRING_CANDIDATE_PATTERN
        pattern.lastIndex = cursor
        if (!pattern.test(input)) {
          cursor = len
          break
        }
        cursor = pattern.lastIndex - 1
      }

      const code = input.charCodeAt(cursor)

      if (stringType === SCAN_TYPE.OSC && code === CHAR_CODE.BEL) {
        return packSequence(cursor + 1, stringType)
      }
      if (code === CHAR_CODE.C1_ST) {
        return packSequence(cursor + 1, stringType)
      }
      if (code === CHAR_CODE.CAN || code === CHAR_CODE.SUB) {
        return packSequence(cursor + 1, SCAN_TYPE.Unknown)
      }
      if (code === CHAR_CODE.ESC) {
        if (
          cursor + 1 < len &&
          input.charCodeAt(cursor + 1) === CHAR_CODE.BACKSLASH
        ) {
          return packSequence(cursor + 2, stringType)
        }

        // A new ESC cancels the control string. Leave it unconsumed so the
        // outer scanner can recognize the new sequence.
        return packSequence(cursor, SCAN_TYPE.Unknown)
      }
      if (isAnsiC1Code(code)) {
        // C1 ST was handled above; any other supported C1 introducer starts a
        // new sequence and must not be swallowed as control-string payload.
        return packSequence(cursor, SCAN_TYPE.Unknown)
      }
      if (code >= 0x80 && code <= 0x9f) {
        // Every C1 control cancels a control string. Unsupported C1 controls
        // are consumed with the canceled sequence rather than treated as
        // standalone ANSI introducers.
        return packSequence(cursor + 1, SCAN_TYPE.Unknown)
      }
      cursor++
    }
  }

  return packSequence(cursor, SCAN_TYPE.Unknown)
}

/**
 * Scan every sequence and expose CSI byte offsets to metadata consumers.
 */
export function scanAnsiSequences(
  input: string,
  firstSequenceStart: number,
  visit: AnsiSequenceVisitor
): void {
  let sequenceStart = firstSequenceStart

  while (sequenceStart !== -1) {
    const packed = scanAnsiSequence(input, sequenceStart)
    const type = scannedSequenceType(packed)
    const end = scannedSequenceEnd(packed)
    let parameterStart = -1
    let parameterEnd = -1
    let intermediateStart = -1
    let intermediateEnd = -1
    let finalIndex = -1

    if (type === AnsiType.CSI) {
      parameterStart =
        input.charCodeAt(sequenceStart) === CHAR_CODE.ESC
          ? sequenceStart + 2
          : sequenceStart + 1
      parameterEnd = parameterStart

      while (
        parameterEnd < end &&
        isCsiParamByte(input.charCodeAt(parameterEnd))
      ) {
        parameterEnd++
      }

      intermediateStart = parameterEnd
      intermediateEnd = intermediateStart
      while (
        intermediateEnd < end &&
        isCsiIntermediateByte(input.charCodeAt(intermediateEnd))
      ) {
        intermediateEnd++
      }
      finalIndex = end - 1
    }

    visit(
      type,
      sequenceStart,
      end,
      parameterStart,
      parameterEnd,
      intermediateStart,
      intermediateEnd,
      finalIndex
    )

    sequenceStart = findNextAnsiIndex(input, end)
  }
}
