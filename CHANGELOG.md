# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [1.0.0] - 2026-03-09

### Added

- `strip(input, options?)` — Strip all ANSI escape codes from a string using a ReDoS-safe state machine parser
- `stripLines(lines, options?)` — Strip ANSI codes from multiple lines efficiently
- `hasAnsi(input)` — Fast check for ANSI codes (200M+ checks/sec, short-circuits on first ESC)
- `hasAnsiAny(inputs)` — Check if any string in an array contains ANSI codes
- `hasAnsiAll(inputs)` — Check if all strings in an array contain ANSI codes
- `parse(input)` — Full ANSI sequence parser returning stripped text and sequence metadata
- `StripOptions.preserve` — Selective stripping: keep specific `AnsiType` sequences while stripping others
- Support for all VT100/ECMA-48 sequence types: CSI, OSC, DCS, and simple escapes
- Fast path optimization: strings without ESC return immediately (16.6M ops/sec)
- Full TypeScript support with strict types (`AnsiSequence`, `ParseResult`, `AnsiType`, `StripOptions`)
- Zero runtime dependencies — no supply chain risk
- ReDoS-safe by design: O(n) state machine, immune to CVE-2021-3807-style attacks
- 111 tests including 16 security-specific tests
- ESM + CJS dual output with source maps
