/**
 * Integration tests for real-world use cases
 */

import { describe, it, expect } from 'vitest'
import {
  createStreamingStripper,
  strip,
  parse,
  hasAnsi,
} from '../../src/index.js'

describe('Real-world use cases', () => {
  describe('Terminal output from test runners', () => {
    it('should handle Vitest output', () => {
      const input =
        '\x1b[1;32m✓\x1b[0m \x1b[2mtest/unit/strip.test.ts\x1b[0m \x1b[2m(5 tests)\x1b[0m'
      expect(strip(input)).toBe('✓ test/unit/strip.test.ts (5 tests)')
    })

    it('should handle Jest output', () => {
      const input = '\x1b[32m PASS \x1b[0m \x1b[2msrc/\x1b[0mindex.test.ts'
      expect(strip(input)).toBe(' PASS  src/index.test.ts')
    })

    it('should handle error messages with colors', () => {
      const input =
        '\x1b[1;31m✗\x1b[0m Test failed: \x1b[2mExpected\x1b[0m \x1b[31m5\x1b[0m \x1b[2mbut got\x1b[0m \x1b[32m10\x1b[0m'
      expect(strip(input)).toBe('✗ Test failed: Expected 5 but got 10')
    })
  })

  describe('Build tool output', () => {
    it('should handle Vite build output', () => {
      const input =
        '\x1b[32mvite v5.0.0\x1b[0m \x1b[2mbuilding for production...\x1b[0m'
      expect(strip(input)).toBe('vite v5.0.0 building for production...')
    })

    it('should handle webpack progress', () => {
      const input = '\x1b[1A\x1b[2K\x1b[1G\x1b[36m●\x1b[0m Compiling... 42%'
      expect(strip(input)).toBe('● Compiling... 42%')
    })
  })

  describe('CLI tool output', () => {
    it('should handle npm install output', () => {
      const input =
        '\x1b[1;32madded\x1b[0m 42 packages in \x1b[2m1.5s\x1b[0m'
      expect(strip(input)).toBe('added 42 packages in 1.5s')
    })

    it('should handle git status output', () => {
      const input = '\x1b[31mmodified:   \x1b[0msrc/index.ts'
      expect(strip(input)).toBe('modified:   src/index.ts')
    })

    it('should handle hyperlinks in terminal', () => {
      const input =
        'Visit \x1b]8;;https://example.com\x1b\\example.com\x1b]8;;\x1b\\ for more info'
      expect(strip(input)).toBe('Visit example.com for more info')
    })
  })

  describe('Logging output', () => {
    it('should handle winston/pino colored logs', () => {
      const input =
        '\x1b[32m[INFO]\x1b[0m \x1b[2m2024-01-01 12:00:00\x1b[0m Server started'
      expect(strip(input)).toBe('[INFO] 2024-01-01 12:00:00 Server started')
    })

    it('should handle multi-line logs', () => {
      const lines = [
        '\x1b[31m[ERROR]\x1b[0m Database connection failed',
        '\x1b[2m  at connect (db.ts:42)\x1b[0m',
        '\x1b[2m  at init (server.ts:10)\x1b[0m',
      ]

      expect(lines.map(strip)).toEqual([
        '[ERROR] Database connection failed',
        '  at connect (db.ts:42)',
        '  at init (server.ts:10)',
      ])
    })
  })

  describe('Complex real-world scenarios', () => {
    it('should handle terminal recording output', () => {
      const input = `\x1b[1;1H\x1b[2J\x1b[1;32m$ npm test\x1b[0m
\x1b[1;32m✓\x1b[0m All tests passed \x1b[2m(42 tests in 1.5s)\x1b[0m`

      const expected = `$ npm test
✓ All tests passed (42 tests in 1.5s)`

      expect(strip(input)).toBe(expected)
    })

    it('should handle progress bars', () => {
      const input =
        '\x1b[1A\x1b[2K\x1b[1GDownloading... \x1b[36m████████░░\x1b[0m 80%'
      expect(strip(input)).toBe('Downloading... ████████░░ 80%')
    })

    it('should preserve spacing and formatting', () => {
      const input = `\x1b[1mHeader\x1b[0m
  \x1b[2mIndented line 1\x1b[0m
  \x1b[2mIndented line 2\x1b[0m`

      const expected = `Header
  Indented line 1
  Indented line 2`

      expect(strip(input)).toBe(expected)
    })
  })

  describe('Performance with real data', () => {
    it('should handle large log files efficiently', () => {
      // Simulate a large log file with mixed ANSI codes
      const logLines = Array.from({ length: 1000 }, (_, i) => {
        const severity = i % 3 === 0 ? 'ERROR' : i % 2 === 0 ? 'WARN' : 'INFO'
        const color = i % 3 === 0 ? '31' : i % 2 === 0 ? '33' : '32'
        return `\x1b[${color}m[${severity}]\x1b[0m Log message ${i}`
      })

      const input = logLines.join('\n')
      const result = strip(input)

      expect(hasAnsi(result)).toBe(false)
      expect(result.split('\n')).toHaveLength(1000)
    })

    it('should handle streaming output chunks', () => {
      // Simulate chunks from a streaming process
      const chunks = [
        '\x1b[1;32mBuilding',
        '...',
        ' done\x1b[0m\n',
        '\x1b[1;36mOptimizing',
        '...',
        ' done\x1b[0m\n',
      ]

      const combined = chunks.join('')
      expect(strip(combined)).toBe('Building... done\nOptimizing... done\n')
    })

    it('should strip OSC and DCS sequences split across chunks', () => {
      const stripper = createStreamingStripper()

      expect(stripper.write('Hello \x1b]0;Tit')).toBe('Hello ')
      expect(stripper.write('le\x07World \x1bPpay')).toBe('World ')
      expect(stripper.write('load\x1b\\Done')).toBe('Done')
      expect(stripper.end()).toBe('')
    })
  })

  describe('Edge cases from production', () => {
    it('should handle mixed Unicode and ANSI', () => {
      const input = '\x1b[1;32m✓\x1b[0m Test \x1b[2m你好\x1b[0m 🎉'
      expect(strip(input)).toBe('✓ Test 你好 🎉')
    })

    it('should handle malformed ANSI from corrupted streams', () => {
      // Incomplete sequences that might occur in buffered streams
      const input = 'Text \x1b[31 more text \x1b incomplete'
      const result = strip(input)
      expect(hasAnsi(result)).toBe(false) // All ESC chars should be removed
    })

    it('should handle empty and whitespace-only strings', () => {
      expect(strip('')).toBe('')
      expect(strip('   ')).toBe('   ')
      expect(strip('\x1b[0m')).toBe('')
      expect(strip('\x1b[31m\x1b[0m   ')).toBe('   ')
    })
  })

  describe('Parse integration', () => {
    it('should provide detailed sequence info for debugging', () => {
      const input = '\x1b[1;31mError:\x1b[0m Failed'
      const result = parse(input)

      expect(result.text).toBe('Error: Failed')
      expect(result.sequences).toHaveLength(2)

      // First sequence: bold red
      expect(result.sequences[0]?.params).toEqual(['1', '31'])
      expect(result.sequences[0]?.final).toBe('m')

      // Second sequence: reset
      expect(result.sequences[1]?.params).toEqual(['0'])
      expect(result.sequences[1]?.final).toBe('m')
    })

    it('should track positions for error reporting', () => {
      const input = 'Normal \x1b[31mRed\x1b[0m text'
      const result = parse(input)

      expect(result.sequences[0]?.start).toBe(7) // After "Normal "
      expect(result.sequences[0]?.end).toBe(12)
      expect(result.sequences[1]?.start).toBe(15) // After "Red"
      expect(result.sequences[1]?.end).toBe(19)
    })
  })
})
