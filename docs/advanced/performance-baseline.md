# Local Electron performance baseline

This maintainer runner exercises the real Electron window, native OpenSSH terminals,
SSH/SFTP adapters, transfer queue and CodeMirror editor with synthetic local data.
It uses **unpackaged Electron with production renderer assets and the existing
development-license exemption**. It is not packaged, activated or shipped-app proof.
No enrollment, Secure Node service, protocol workspace or remote account is required.

## Runtime and preparation

Use a separate worktree with its own installed workspace dependencies, Node **22.22.0**,
Electron **40.10.1**, a graphical macOS session, `/usr/bin/ssh` and `/usr/bin/openssl`.
Resolve workspace links inside that worktree; do not point them at another build.
The runner needs the declared `playwright-core` and `pngjs` dependencies. Native
`better-sqlite3` and `node-pty` must target Electron's ABI, not the driver's Node ABI.
`cpu-features` needs its generated `buildcheck.gypi` before native dependency rebuilding.
Do not treat copied dependencies or historical generated assets as a fresh build.

From the repository root, with the compatible dependencies already available:

```sh
node --version # v22.22.0
npm run perf:prepare --workspace=ownshell-desktop
```

`perf:prepare` builds the UI workspace and invokes the ordinary desktop `build:vite`
chain: core workspace build, clean assets, TypeScript, worker build and Vite.
No Node-service workspace is built or started. This does not package or install the app.
The launch clears the development-server URL and loads the branch-local production
assets. Development seeding is excluded so setup is genuinely fresh.

## Commands and output

Run these commands from the **repository root**, serially, using distinct output roots:

```sh
caffeinate -dimsu npm run perf:smoke --workspace=ownshell-desktop -- --output /tmp/ownshell-local-smoke
caffeinate -dimsu npm run perf:baseline --workspace=ownshell-desktop -- --profile all --capture-after-outcome --output /tmp/ownshell-local-full
caffeinate -dimsu node apps/desktop/scripts/performance/ticket-13-startup.cjs --output /tmp/ownshell-local-startup
caffeinate -dimsu node apps/desktop/scripts/performance/ticket-13-close-failure.cjs --output /tmp/ownshell-local-close-failure
```

`--profile everyday` or `--profile stress` selects one complete mixed profile.
Smoke provisions the everyday workload and exits after readiness; it does **not**
establish latency or completed transfer-integrity acceptance. The full command runs
both profiles. A failed prerequisite, correctness assertion or pixel match fails the run.

The runner prints `ARTIFACTS <root>`. Mixed artifacts live under `<root>/everyday/`
and `<root>/stress/`: `report.json`, `fixture-events.json`, workload screenshots and
sample capture evidence. Startup writes `<root>/everyday/fresh-1/` through `fresh-3/`
and `<root>/startup-summary.json`. Close-failure writes the deliberately failed
`<root>/everyday/close-failure/report.json` and `<root>/close-failure-result.json`;
only the latter's assertions establish that the expected-failure smoke passed.

Where the shared measurement-slot wrapper is available, place each command beneath
`python3 <shared-root>/measurement-slot.py --requires-unlocked-screen --`.
This rejects a locked console session rather than polling or unlocking it.
`caffeinate -dimsu`, or the coordinating wake service, prevents automatic sleep;
manual OS locks and normal security controls remain effective. An initially locked
session or observed screen-lock event invalidates graphical measurements.
Native window visibility and foreground focus are required before timed input.
Do not run competing GUI measurements, builds or fixture startups concurrently.

## Fresh local profile and confinement

Each profile creates a disposable `ownshell-benchmark-*` root and real local
`ownshell.db`. The public UI creates the master password, acknowledges the recovery
key, passes the actual license gate under the existing development exemption,
dismisses welcome notes and creates real localhost SSH hosts. Existing-profile
runs use normal password unlock. No private auth/store mutation or protocol stub
substitutes for initialization, recovery acknowledgement, encryption or persistence.

Only one-use synthetic credentials and loopback fixtures are used. The original
checkout, personal vault, normal profile, SSH config and agents are not used.
The bootstrap refuses packaged mode, missing opt-in and profiles outside its
controlled temporary location. Socket/TLS/DNS guards cover main and workers;
renderer external requests and external application launches are rejected.
Native SSH is confined to the fixture with disposable known-host data, no proxy,
no agent and no public-key authentication. Node.js networking guards are runtime
confinement, not a Secure Node service. Keep the positive loopback flow and negative
main/worker/renderer/native-target probes together; do not bypass them for a run.

## Fixed mixed workload

`apps/desktop/scripts/performance/workloads.cjs` is the source of truth.

| Quantity | Everyday | Stress |
| --- | ---: | ---: |
| Native terminals | 4 | 8 |
| Continuously emitting terminals | 1 | 2 |
| Output per emitting terminal | 100 lines/s, 128 bytes/line | Same |
| Concurrent SFTP downloads | Two × 512 MiB | Same |
| Initial editor document | 1 MiB | 10 MiB − 128 bytes |
| Remote listing entries, excluding `..` | 10,000 | 50,000 |
| Window size | 1,200 × 800 DIP | Same |

After readiness and a ten-second warm-up, three repetitions each perform 30 editor
keystrokes, 30 editor wheel scrolls, 30 directory wheel scrolls, 30 warm feature-tab
switches and three real remote command echoes: **369 measured actions per profile**.
The editor is saved and independently reread over SFTP after each repetition.
Both downloads must remain active throughout every measured input-to-frame interval;
only afterward does the explicitly unmeasured drain complete them and verify hashes.

Retain complete results, independent saved-byte comparisons, transfer hashes,
ordered terminal streams, full listing navigation and latest-state/undo correctness
in applicable feature evidence. Virtualization and bounded instrumentation are not
permission to cap document bytes, listing results, stream data or transfer payloads.
Viewport row counts alone neither prove completeness nor disprove virtualization.

## Input and visible-response measurement

Timed keyboard, wheel and pointer events use actual Electron
`webContents.sendInputEvent`, after native focus. Main-process dispatch starts the
clock. DOM outcomes, IPC delivery and animation callbacks support correctness but
are not presented-pixel endpoints. Meaningful regions contain editor text, directory
rows or terminal/tab content, excluding unrelated panes, caret-only changes and
scrollbar/hover chrome. Exact RGBA target matching verifies typing, tabs and echo;
scroll samples detect qualifying real vertical text/row movement and independently
verify final bounds and expected anchors.

Acquisition uses public regional `capturePage` readbacks, sequentially with a **4 ms
cooldown**, within an eight-second horizon and 960-distinct-image safety bound.
DIP coordinates are converted to actual captured pixel scale. Images are timestamped
before inspection; adjacent identical frames retain observation counts and times.
The primary latency is the first qualifying capture, not the subsequent 300 ms hold.
These are **input-to-compositor-capture upper bounds**, not physical scan-out times,
human perception or guaranteed 250 fps sampling. No overhead is subtracted.

Default acquisition remains sequential. `--capture-after-outcome` opts into
**`sequential-plus-outcome`, modeVersion 1**: at most one additional regional readback
following the genuine semantic outcome, within the same bounds. Both in-flight
paths are drained before errors propagate. Reports identify the mode and outcome
readback count. Compare identical modes, acquisition versions, regions and workloads;
a cross-mode difference is not a product performance gain.

All **eight** p95 goals remain separate: everyday editor typing, editor scrolling
and directory scrolling ≤32 ms each, warm switching ≤100 ms; stress equivalents
≤50 ms each and ≤150 ms. Report nearest-rank p50/p95/p99, maximum, count and every
above-target sample. Remote echo has no local single-key target. Resource sampling
is 1 Hz, not a default 1 kHz profiler or independent latency measurement. Preserve
sampler, readback, encoding and comparison costs separately; do not subtract them.

## Startup, cleanup and evidence status

Startup covers three fresh profiles, three process restarts and three in-process
unlocks per profile, wrong-password rejection, persisted hosts and a meaningful first
native host action with compositor evidence. Fresh means isolated profile, not an
emptied OS cache. There is no agreed absolute startup threshold; small-sample
nearest-rank distributions and wall-clock milestones are not CPU attribution.

Every successful run must retain `safety.cleanup.electronExited`, `sshClosed` and
`temporaryProfileRemoved`, all `true`, plus screen-lock and confinement evidence.
There is no `nodeClosed` requirement. Cleanup closes Electron and SSH clients/timers,
then removes temporary profiles, keys, recovery data and downloaded payloads.
Only secret-free artifacts remain under the requested output root.

## Verified local-only candidate — 2026-11-07

The candidate starts at pre-experiment `origin/main` (`b9caf69`), retaining the
performance diff from `57df774` to `bee808e` without its Secure Node foundation.
The freshly built product source is `aa7397a`; the measured revision `d440fb0`
adds methodology documentation only. Product version remains **1.23.2**.
The original checkout and `integration/performance-native-feel` backup are preserved.
Independent non-performance Git browser/clone/add-remote UI from `0b7defd` is not
part of this pre-experiment-baseline performance-only candidate.

Both complete profiles passed on Apple M5 Max, 18 logical CPUs, 128 GiB RAM,
unpackaged Electron 40.10.1, acquisition version 2, `sequential-plus-outcome` v1.
Each profile retained all 369 samples, three repetitions, trusted native input and
foreground-window/webContents evidence. All eight local p95 goals passed; no local
above-goal samples occurred. Values below are milliseconds, without overhead subtraction.

| Action | Samples per profile | Everyday p95 | Goal | Stress p95 | Goal |
| --- | ---: | ---: | ---: | ---: | ---: |
| Editor typing | 90 | 24.74 | 32 | 28.24 | 50 |
| Editor scrolling | 90 | 13.83 | 32 | 13.77 | 50 |
| Directory scrolling | 90 | 12.57 | 32 | 13.39 | 50 |
| Warm tab switching | 90 | 28.78 | 100 | 32.26 | 150 |
| Remote terminal echo | 9 | 62.84 | — | 64.02 | — |

Both profiles independently re-read all edited bytes over actual SFTP after each
repetition, verified both complete 512 MiB downloads and ordered terminal output,
and retained active background-transfer overlap throughout measurements. Confinement
probes passed; no screen locks occurred; Electron, SSH and temporary-profile cleanup
were all successful.

Fresh local startup also passed: three independent profiles, twelve process starts,
eighteen valid unlocks and three rejected wrong passwords. Focused real UI smokes
passed SSH/standalone UTF-8 and Latin-1 full-byte saves, initialized/pending SFTP worker
owner closure with original downloads completing, visible-unfocused Docker polling,
and Docker logs/console survival while Settings hides the workspace.
DE/EN Mongo constructor-unavailability errors were exercised on both editors, followed
by restored genuine-worker loading; four other fallback branches remain source-reviewed
only. The expected close-failure smoke passed with one launch and complete cleanup.

Exact distributions, source/build metadata, correctness, limitations, eighteen core
file hashes and the complete raw-collection checksum are recorded in
`apps/desktop/performance-baselines/2026-11-07-local-only.json`.
Earlier aborted runs remain explicitly excluded: the first mixed attempt observed
six additional unclassified native keyboard events; its cause is not established.
The exclusive-desktop run passed without product, goal, matcher or acquisition changes.
Temporary probe-argument and single-pane-selector errors are also recorded separately.

These results are not a cross-build performance-gain claim, packaged-app proof,
fresh twenty-cycle/cache-expiry evidence or native OS corner-drag proof.
Historical `bee808e`/Secure Node reports remain historical and are not relabeled.

### Development follow-up — 2026-11-08

The clean branch subsequently restores the independent Git code browser and SSH
clone/add-remote commands and adds native local trial activation. Neither feature
introduces a Secure Node dependency. The November 7 measurements above describe
the pinned candidate only; they have not been rerun or relabeled for this follow-up.
