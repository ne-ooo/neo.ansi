# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added

- Add `createStreamingStripper()` for constant-memory stripping across arbitrary chunk boundaries

### Fixed

- Recover visible text after CAN, SUB, ESC, or any C1 control cancels an unfinished OSC, DCS, SOS, PM, or APC control string
- Correct parse offsets and C1 fast-path wording in published documentation
- Include the linked `BENCHMARKS.md` file in the published package

### Security

- Replace buffering streaming recipes that could repeatedly rescan attacker-controlled payloads
- Refresh dependency locks past the high-severity Nanoid advisory and migrate the LPM lockfile to the current format

### Performance

- Remove the steerable dense-CSI prepass and add native candidate jumps for long control-string payloads
- Normalize selective-preservation types into a bitmask for constant-time sequence checks
- Avoid regex match allocations after the first scanner match and use a single combined plain-input scan

## [1.1.0] - 2026-08-03

### Fixed

- Recognize 8-bit C1 forms of CSI, OSC, DCS, SOS, PM, APC, and ST
- Parse the complete ECMA-48 CSI parameter/intermediate byte grammar
- Parse ESC sequences containing intermediate bytes
- Distinguish SOS, PM, and APC sequence types instead of reporting them as DCS
- Require ST for DCS/SOS/PM/APC while retaining BEL compatibility for OSC
- Mark unterminated string controls as `AnsiType.Unknown` so chunk buffering works
- Reprocess repeated ESC introducers instead of leaking the following sequence payload
- Preserve exact CSI parameter/intermediate bytes, private markers, empty parameters, and colon subparameters in parse metadata
- Remove the unused, undocumented `StripOptions.stripAll` property

### Security

- Upgrade Vitest/Vite tooling past known high and critical advisories
- Add a lockfile, dependency audit command, and CI verification matrix
- Replace wall-clock security assertions and the placeholder memory test with deterministic output checks and bounded retained-heap verification

### Performance

- Strip directly with an allocation-light scanner instead of constructing `parse()` metadata
- Add an inlined ESC-only path and a validated dense-CSI fast path with scanner fallback
- Return plain strings without parsing and detect supported C1 controls without metadata allocation
- Preallocate `stripLines()` output and avoid callback/tuple allocation on the strip hot path
- Add pinned, output-equivalent benchmarks against `strip-ansi@7.2.0`
- Add deterministic differential tests between optimized stripping and metadata parsing

## [1.0.0] - 2026-03-09

### Added

- `strip(input, options?)` — Strip supported ANSI escape sequences using a linear state-machine parser
- `stripLines(lines, options?)` — Strip ANSI codes from multiple lines efficiently
- `hasAnsi(input)` — Fast check for the ESC introducer
- `hasAnsiAny(inputs)` — Check if any string in an array contains ANSI codes
- `hasAnsiAll(inputs)` — Check if all strings in an array contain ANSI codes
- `parse(input)` — Full ANSI sequence parser returning stripped text and sequence metadata
- `StripOptions.preserve` — Selective stripping: keep specific `AnsiType` sequences while stripping others
- Initial support for CSI, OSC, DCS, and simple ESC sequences
- Fast path optimization for strings without ESC
- Full TypeScript support with strict types (`AnsiSequence`, `ParseResult`, `AnsiType`, `StripOptions`)
- Zero runtime dependencies, reducing runtime supply-chain exposure
- ReDoS-safe by design: O(n) state machine, immune to CVE-2021-3807-style attacks
- Unit, integration, benchmark, and security-focused tests
- ESM + CJS dual output with source maps
