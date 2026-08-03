# Benchmarks

The benchmark suite compares `neo.ansi` with the pinned `strip-ansi@7.2.0`
development dependency. Every comparison verifies output equality before the
benchmark is registered.

```bash
npm run bench
```

## Reference run

Recorded on 3 August 2026 using Node.js 26.5.0, Vitest 3.2.7, macOS 26.5.2,
and an Apple M5 Pro. Results are operations per second from one Vitest bench
run; higher is better.

| Workload | neo.ansi | strip-ansi | Relative |
|---|---:|---:|---:|
| Plain text | 24.34M | 14.86M | 1.64x |
| Simple SGR | 16.80M | 10.50M | 1.60x |
| Mixed CLI output | 4.03M | 4.29M | 0.94x |
| OSC hyperlink | 9.70M | 9.32M | 1.04x |
| 100 log lines | 386.0K | 382.4K | 1.01x |
| 10KB sparse ANSI | 1.86M | 416.0K | 4.46x |
| 1,000 consecutive sequences | 142.7K | 77.3K | 1.85x |
| 1,000 CSI parameters | 659.3K | 476.0K | 1.39x |
| Unterminated CSI parameters | 368.0K | 250.5K | 1.47x |

The mixed CLI case remains about 6% behind in this run. Near-parity results
should not be treated as universal wins: Node version, CPU, string shape, and
runtime load all affect small benchmarks. Run the suite on the intended
deployment environment before making capacity decisions.

Vitest also prints sample counts, minimum/maximum latency, percentiles, and
relative margin of error. The malformed-input comparator had a high relative
margin of error in this reference run, so its exact ratio warrants extra
caution.

## What is measured

The comparison corpus covers:

- plain strings and simple SGR;
- mixed and multi-line CLI output;
- OSC hyperlinks;
- large strings with sparse ANSI;
- dense repeated sequences;
- complete and unterminated long CSI parameter lists.

Additional neo.ansi-only benches measure metadata parsing, selective
preservation, and 8-bit C1 stripping because `strip-ansi` does not expose
equivalent APIs for all three operations.

## Implementation notes

- Plain strings return immediately after ESC/C1 introducer detection.
- Default stripping scans sequences directly and does not allocate parse
  metadata.
- The common ESC-only path uses an inlined forward scanner.
- Dense, ordinary CSI output can use a native linear replacement fast path;
  any remaining ESC/C1 control falls back to the complete scanner.
- `parse()` deliberately allocates lossless sequence metadata only when the
  caller requests it.
- `stripLines()` preallocates its result array.

The scanner and dense-CSI expression use ordered, disjoint byte classes. The
security suite separately verifies large complete, incomplete, repeated, and
string-control inputs.

## Reproducing comparisons

For useful comparisons:

1. Install from the committed lockfile with `npm ci`.
2. Use the same Node version and an otherwise idle machine.
3. Run `npm run bench` more than once and compare the reported variance.
4. Keep only workloads where both packages produce identical output.
5. Record the exact environment and package lock revision with published
   results.

CVE-2021-3807 applies to historical vulnerable `ansi-regex` versions, not the
current pinned `strip-ansi` release used here.
