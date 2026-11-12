'use strict';

const MiB = 1024 * 1024;
const profiles = Object.freeze({
  everyday: { terminals: 4, outputTerminals: 1, textBytes: MiB, entries: 10000, inputTargetMs: 32, switchTargetMs: 100 },
  stress: { terminals: 8, outputTerminals: 2, textBytes: 10 * MiB - 128, entries: 50000, inputTargetMs: 50, switchTargetMs: 150 },
});
const schedule = Object.freeze({ warmupMs: 10000, repetitions: 3, samplesPerAction: 30, terminalEchoSamplesPerRepetition: 3, actionIntervalMs: 300, presentationVerificationHoldMs: 300, measurementMinimumMs: 218700, interactiveObservationMs: 180000, outputLinesPerSecond: 100, outputLineBytes: 128, transferBytes: 512 * MiB, transferReadBytes: 32768, transferDelayMs: 20, unmeasuredDrainDelayMs: 0 });
function text(bytes) {
  const lines = Array.from({ length: bytes / 128 }, (_, index) => (`LINE ${String(index).padStart(8, '0')} benchmark synthetic text; `).padEnd(127, 'x') + '\n');
  return Buffer.from(lines.join(''));
}
function transferChunk(offset, length) {
  const bytes = Buffer.allocUnsafe(length);
  for (let i = 0; i < length; i++) bytes[i] = (offset + i) % 251;
  return bytes;
}
function quantiles(samples, target) {
  const sorted = samples.map(s => s.durationMs).sort((a, b) => a - b);
  const q = p => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)] ?? null;
  return { n: sorted.length, p50: q(.5), p95: q(.95), p99: q(.99), max: sorted.at(-1) ?? null, targetMs: target, outliers: samples.filter(s => s.durationMs > target) };
}
module.exports = { profiles, schedule, text, transferChunk, quantiles };
