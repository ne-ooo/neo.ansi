# Benchmarks

The benchmark suite compares `neo.ansi` with the pinned `strip-ansi@7.2.0`
development dependency. Every comparison verifies output equality before the
benchmark is registered.

```bash
npm run bench
```

## Reference run

Recorded on 31 August 2026 using Node.js 26.5.0, Vitest 3.2.7, macOS 26.5.2,
and an Apple M5 Pro. Results are operations per second from one Vitest bench
run; higher is better.

| Workload | neo.ansi | strip-ansi | Relative |
|---|---:|---:|---:|
| Plain text | 10.92M | 13.32M | 0.82x |
| Simple SGR | 7.15M | 9.96M | 0.72x |
| Mixed CLI output | 2.39M | 4.30M | 0.55x |
| OSC hyperlink | 4.10M | 8.57M | 0.48x |
| 100 log lines | 193.7K | 372.3K | 0.52x |
| 10KB sparse ANSI | 1.15M | 398.0K | 2.90x |
| 1MB plain text | 32.2K | 32.3K | 1.00x |
| Clustered CSI prefix + 1MB plain tail | 5.61K | 4.10K | 1.37x |
| 1,000 consecutive sequences | 44.4K | 47.0K | 0.94x |
| 1,000 CSI parameters | 552.8K | 394.3K | 1.40x |
| Unterminated CSI parameters | 607.6K | 456.7K | 1.33x |

The common short, mixed, OSC, and multi-line cases were between 18% and 52%
behind in this run; the dense repeated-sequence case was about 6% behind. The
1MB plain case was within 1%, while the sparse and long-parameter cases were
1.33x to 2.90x ahead. Near-parity results should not be treated as universal
wins: Node version, CPU, string shape, and runtime load all affect small
benchmarks. Run the suite on the intended deployment environment before
making capacity decisions.

Vitest also prints sample counts, minimum/maximum latency, percentiles, and
relative margin of error. The 1,000-consecutive-sequence comparator had a high
relative margin of error in this reference run, so its exact ratio warrants
extra caution.

## What is measured

The comparison corpus covers:

- short and 1MB plain strings, plus simple SGR;
- mixed and multi-line CLI output;
- OSC hyperlinks;
- large strings with sparse ANSI, including a clustered-prefix regression;
- dense repeated sequences;
- complete and unterminated long CSI parameter lists.

Additional neo.ansi-only benches measure metadata parsing, selective
preservation, 8-bit C1 stripping, sparse-dispatch regressions, and 1MB
unterminated 7-bit/C1 control strings because `strip-ansi` does not expose
equivalent behavior for all of these cases.

## Implementation notes

- Plain strings return immediately after ESC/C1 introducer detection.
- Default stripping scans sequences directly and does not allocate parse
  metadata.
- The common ESC-only path uses an inlined forward scanner.
- Native candidate searches skip long control-string payload spans. Short
  payloads stay on the lower-overhead byte loop.
- `parse()` deliberately allocates lossless sequence metadata only when the
  caller requests it.
- `stripLines()` preallocates its result array.

The scanner uses ordered, disjoint byte classes. The security suite separately
verifies large complete, incomplete, repeated, and string-control inputs.

## Reproducing comparisons

For useful comparisons:

1. Install from the committed lockfile with `lpm install --frozen-lockfile`.
2. Use the same Node version and an otherwise idle machine.
3. Run `npm run bench` more than once and compare the reported variance.
4. Keep only workloads where both packages produce identical output.
5. Record the exact environment and package lock revision with published
   results.

CVE-2021-3807 applies to historical vulnerable `ansi-regex` versions, not the
current pinned `strip-ansi` release used here.
