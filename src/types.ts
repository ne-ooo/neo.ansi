/**
 * TypeScript type definitions for @lpm.dev/neo.ansi
 *
 * Modern, zero-dependency ANSI escape code parser and stripper
 */

/**
 * ANSI escape sequence types based on VT100 specification
 */
export enum AnsiType {
  /** CSI (Control Sequence Introducer) - ESC [ ... */
  CSI = 'csi',
  /** OSC (Operating System Command) - ESC ] ... */
  OSC = 'osc',
  /** DCS (Device Control String) - ESC P ... */
  DCS = 'dcs',
  /** SOS (Start of String) - ESC X ... */
  SOS = 'sos',
  /** PM (Privacy Message) - ESC ^ ... */
  PM = 'pm',
  /** APC (Application Program Command) - ESC _ ... */
  APC = 'apc',
  /** Simple/intermediate ESC sequences and standalone C1 ST */
  Simple = 'simple',
  /** Unknown/malformed sequence */
  Unknown = 'unknown',
}

/**
 * Parsed ANSI escape sequence
 */
export interface AnsiSequence {
  /** Type of ANSI sequence */
  type: AnsiType
  /** Raw sequence including ESC */
  raw: string
  /** Start position in original string */
  start: number
  /** End position in original string */
  end: number
  /** Semicolon-delimited CSI parameters; colon subparameters remain intact */
  params?: string[]
  /** Exact CSI parameter-byte substring, including private markers */
  parameterBytes?: string
  /** Leading CSI private marker bytes (<, =, >, or ?) */
  privateMarker?: string
  /** Exact CSI intermediate-byte substring */
  intermediateBytes?: string
  /** Final character (for CSI sequences) */
  final?: string
}

/**
 * Parse result containing stripped text and sequences
 */
export interface ParseResult {
  /** Text with ANSI codes removed */
  text: string
  /** All ANSI sequences found */
  sequences: AnsiSequence[]
}

/**
 * Parser state machine states
 */
export enum ParserState {
  /** Normal text */
  Normal = 0,
  /** ESC received, waiting for next character */
  Escape = 1,
  /** CSI sequence started (ESC [) */
  CSI = 2,
  /** OSC sequence started (ESC ]) */
  OSC = 3,
  /** DCS sequence started (ESC P) */
  DCS = 4,
  /** SOS sequence started (ESC X) */
  SOS = 5,
  /** PM sequence started (ESC ^) */
  PM = 6,
  /** APC sequence started (ESC _) */
  APC = 7,
}

/**
 * Strip options for customizing ANSI stripping behavior
 */
export interface StripOptions {
  /**
   * Preserve specific ANSI types while stripping all others
   */
  preserve?: AnsiType[]
}

/**
 * Type guard to check if value is AnsiType
 */
export function isAnsiType(value: unknown): value is AnsiType {
  return (
    typeof value === 'string' &&
    Object.values(AnsiType).includes(value as AnsiType)
  )
}
