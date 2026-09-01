/**
 * Incremental ANSI stripping for inputs split across arbitrary chunks.
 *
 * The state machine retains only its current parser state and, when needed,
 * one trailing UTF-16 high surrogate. Control-string payloads are never
 * buffered or rescanned.
 */

import { findNextAnsiIndex } from './scanner.js'
import {
  OSC_STRING_CANDIDATE_PATTERN,
  STRING_CANDIDATE_PATTERN,
  STRING_SEARCH_THRESHOLD,
} from './constants.js'
import { finalizeScannedString } from './string-memory.js'
import type { StreamingStripper } from '../types.js'

const enum StreamState {
  Ground,
  Escape,
  EscapeIntermediate,
  CsiParameter,
  CsiIntermediate,
  Osc,
  StringControl,
  StringEscape,
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff
}

class AnsiStreamingStripper implements StreamingStripper {
  private state = StreamState.Ground
  private pendingHighSurrogate = ''

  write(chunk: string): string {
    const input = chunk
    const initialState = this.state
    const hadPendingAtStart = this.pendingHighSurrogate.length > 0
    const parts: string[] = []
    let inputWasTransformed = initialState !== StreamState.Ground
    let regexWasUsed = false
    let cursor = 0

    while (cursor < input.length) {
      if (this.state === StreamState.Ground) {
        const sequenceStart = findNextAnsiIndex(input, cursor)
        if (sequenceStart === -1) {
          if (cursor < input.length) parts.push(input.slice(cursor))
          break
        }

        if (cursor < sequenceStart) {
          parts.push(input.slice(cursor, sequenceStart))
        }
        cursor = sequenceStart
        inputWasTransformed = true

        const introducer = input.charCodeAt(cursor++)
        if (introducer === 0x1b) {
          this.state = StreamState.Escape
        } else {
          this.startC1(introducer)
        }
        continue
      }

      const code = input.charCodeAt(cursor)

      switch (this.state) {
        case StreamState.Escape:
          if (code === 0x5b) {
            this.state = StreamState.CsiParameter
            cursor++
          } else if (code === 0x5d) {
            this.state = StreamState.Osc
            cursor++
          } else if (
            code === 0x50 ||
            code === 0x58 ||
            code === 0x5e ||
            code === 0x5f
          ) {
            this.state = StreamState.StringControl
            cursor++
          } else if (code >= 0x30 && code <= 0x7e) {
            this.state = StreamState.Ground
            cursor++
          } else if (code >= 0x20 && code <= 0x2f) {
            this.state = StreamState.EscapeIntermediate
            cursor++
          } else {
            // The ESC is malformed; reprocess this code unit as normal input.
            this.state = StreamState.Ground
          }
          break

        case StreamState.EscapeIntermediate:
          if (code >= 0x20 && code <= 0x2f) {
            cursor++
          } else if (code >= 0x30 && code <= 0x7e) {
            this.state = StreamState.Ground
            cursor++
          } else {
            this.state = StreamState.Ground
          }
          break

        case StreamState.CsiParameter:
          if (code >= 0x30 && code <= 0x3f) {
            cursor++
          } else if (code >= 0x20 && code <= 0x2f) {
            this.state = StreamState.CsiIntermediate
            cursor++
          } else if (code >= 0x40 && code <= 0x7e) {
            this.state = StreamState.Ground
            cursor++
          } else {
            this.state = StreamState.Ground
          }
          break

        case StreamState.CsiIntermediate:
          if (code >= 0x20 && code <= 0x2f) {
            cursor++
          } else if (code >= 0x40 && code <= 0x7e) {
            this.state = StreamState.Ground
            cursor++
          } else {
            this.state = StreamState.Ground
          }
          break

        case StreamState.Osc:
          if (input.length - cursor >= STRING_SEARCH_THRESHOLD) {
            OSC_STRING_CANDIDATE_PATTERN.lastIndex = cursor
            if (!OSC_STRING_CANDIDATE_PATTERN.test(input)) {
              cursor = input.length
              break
            }
            regexWasUsed = true
            cursor = OSC_STRING_CANDIDATE_PATTERN.lastIndex - 1
          }

          {
            const stringCode = input.charCodeAt(cursor)
            if (stringCode === 0x07 || stringCode === 0x9c) {
              this.state = StreamState.Ground
              cursor++
            } else if (stringCode === 0x18 || stringCode === 0x1a) {
              this.state = StreamState.Ground
              cursor++
            } else if (stringCode === 0x1b) {
              this.state = StreamState.StringEscape
              cursor++
            } else if (stringCode >= 0x80 && stringCode <= 0x9f) {
              this.startC1(stringCode)
              cursor++
            } else {
              cursor++
            }
          }
          break

        case StreamState.StringControl:
          if (input.length - cursor >= STRING_SEARCH_THRESHOLD) {
            STRING_CANDIDATE_PATTERN.lastIndex = cursor
            if (!STRING_CANDIDATE_PATTERN.test(input)) {
              cursor = input.length
              break
            }
            regexWasUsed = true
            cursor = STRING_CANDIDATE_PATTERN.lastIndex - 1
          }

          {
            const stringCode = input.charCodeAt(cursor)
            if (
              stringCode === 0x9c ||
              stringCode === 0x18 ||
              stringCode === 0x1a
            ) {
              this.state = StreamState.Ground
              cursor++
            } else if (stringCode === 0x1b) {
              this.state = StreamState.StringEscape
              cursor++
            } else if (stringCode >= 0x80 && stringCode <= 0x9f) {
              this.startC1(stringCode)
              cursor++
            } else {
              cursor++
            }
          }
          break

        case StreamState.StringEscape:
          if (code === 0x5c) {
            this.state = StreamState.Ground
            cursor++
          } else {
            // The prior string was canceled. Treat its ESC as the introducer
            // of a new escape sequence and process this code unit again.
            this.state = StreamState.Escape
          }
          break
      }
    }

    const hadPendingHighSurrogate = this.pendingHighSurrogate.length > 0
    const visibleOutput = parts.join('')
    const output = this.completeVisibleOutput(visibleOutput)
    const outputIsOwned =
      parts.length > 1 &&
      !hadPendingHighSurrogate &&
      output.length === visibleOutput.length

    const detachUnowned =
      inputWasTransformed ||
      hadPendingAtStart ||
      output.length !== input.length

    return finalizeScannedString(
      input.length,
      output,
      outputIsOwned,
      detachUnowned,
      regexWasUsed
    )
  }

  end(): string {
    const tail = this.pendingHighSurrogate
    this.state = StreamState.Ground
    this.pendingHighSurrogate = ''
    return tail
  }

  private completeVisibleOutput(output: string): string {
    const completed = this.pendingHighSurrogate + output
    this.pendingHighSurrogate = ''

    const finalIndex = completed.length - 1
    if (isHighSurrogate(completed.charCodeAt(finalIndex))) {
      this.pendingHighSurrogate = String.fromCharCode(
        completed.charCodeAt(finalIndex)
      )
      return completed.slice(0, finalIndex)
    }

    return completed
  }

  private startC1(code: number): void {
    switch (code) {
      case 0x90:
      case 0x98:
      case 0x9e:
      case 0x9f:
        this.state = StreamState.StringControl
        break
      case 0x9b:
        this.state = StreamState.CsiParameter
        break
      case 0x9d:
        this.state = StreamState.Osc
        break
      default:
        // C1 ST is a standalone control in ground state. Unsupported C1
        // controls cancel strings but otherwise remain outside ANSI grammar.
        this.state = StreamState.Ground
        break
    }
  }
}

/** Create a constant-memory ANSI stripper for arbitrarily chunked strings. */
export function createStreamingStripper(): StreamingStripper {
  return new AnsiStreamingStripper()
}
