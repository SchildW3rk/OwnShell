'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');
const { createHash } = require('node:crypto');
const { schedule } = require('./workloads.cjs');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const decode = base64 => PNG.sync.read(Buffer.from(base64, 'base64'));
function pixelsEqual(a, b, region) {
  if (a.width !== b.width || a.height !== b.height) return false;
  if (!region) return a.data.equals(b.data);
  const stride = a.width * 4;
  for (let y = region.y; y < region.y + region.height; y++) {
    const start = y * stride + region.x * 4;
    const end = start + region.width * 4;
    if (a.data.compare(b.data, start, end, start, end) !== 0) return false;
  }
  return true;
}
// Verify vertical text/row translation, not a caret, scrollbar or color-only change.
// Fixed detector: >=1 physical pixel, >=16 overlapping rows, <=4/255 mean
// grayscale error and >=80% improvement over an unshifted comparison.
function verticalMotion(before, after) {
  if (before.width !== after.width || before.height !== after.height || pixelsEqual(before, after)) return null;
  const width = Math.min(400, before.width);
  const columns = Math.ceil(width / 2);
  const height = before.height;
  const a = new Float32Array(columns * height), b = new Float32Array(columns * height);
  for (let y = 0; y < height; y++) for (let x = 0, column = 0; x < width; x += 2, column++) {
    const pixel = (y * before.width + x) * 4, index = y * columns + column;
    a[index] = (before.data[pixel] + before.data[pixel + 1] + before.data[pixel + 2]) / 3;
    b[index] = (after.data[pixel] + after.data[pixel + 1] + after.data[pixel + 2]) / 3;
  }
  for (let shift = 1; shift <= height - 16; shift++) {
    const count = columns * (height - shift);
    let shifted = 0, unshifted = 0;
    for (let index = 0; index < count; index++) {
      shifted += Math.abs(a[index + shift * columns] - b[index]);
      unshifted += Math.abs(a[index] - b[index]);
    }
    const meanError = shifted / count, unshiftedMeanError = unshifted / count;
    if (unshiftedMeanError >= .2 && meanError <= 4 && meanError <= unshiftedMeanError * .2)
      return { pixelShift: shift, overlapRows: height - shift, sampledColumns: columns, meanError, unshiftedMeanError };
  }
  return null;
}
// Optional non-scroll matchRegion({ region, width, height }) runs after capture.
// It returns a versioned physical { x, y, width, height } rectangle and optional
// public geometry/unsafeReason. Full images remain unchanged; geometry cost is
// an observer subphase of comparisonMs, never subtracted from presentation time.
async function measure({ app, page, directory, id, kind, region, action, outcome, finalOutcome, persistFrames = false, matchRegion, captureAfterOutcome = process.argv.includes('--capture-after-outcome') }) {
  const before = Buffer.from(await app.evaluate(async ({ BrowserWindow }, rect) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage(rect)).toPNG().toString('base64'), region), 'base64');
  await app.evaluate(({ BrowserWindow }, rect) => global.__ownshellBenchmark.startFrames(BrowserWindow.getAllWindows()[0], rect), region);
  const clock = await app.evaluate(() => global.__ownshellBenchmark.clock());
  const eventCount = await page.evaluate(() => globalThis.__perfTrusted.length);
  const nativeDispatch = await action();
  await outcome();
  if (captureAfterOutcome) await app.evaluate(({ BrowserWindow }, rect) => global.__ownshellBenchmark.captureReadyFrame(BrowserWindow.getAllWindows()[0], rect), region);
  const trustedInput = await page.evaluate(count => globalThis.__perfTrusted.slice(count)[0], eventCount);
  if (!trustedInput?.isTrusted) throw new Error(`${id}: no trusted input event`);
  if (nativeDispatch?.source !== 'Electron.webContents.sendInputEvent') throw new Error(`${id}: no actual Electron input dispatch`);
  const inputAt = nativeDispatch.at;
  const trustedInputAt = trustedInput.timeOrigin + trustedInput.at - clock.timeOrigin;
  await wait(schedule.presentationVerificationHoldMs);
  const finalScroll = finalOutcome ? await finalOutcome() : null;
  const capture = await app.evaluate(({ BrowserWindow }, rect) => global.__ownshellBenchmark.finishFrames(BrowserWindow.getAllWindows()[0], rect), region);
  const comparisonStart = performance.now();
  const reference = decode(capture.reference);
  const old = PNG.sync.read(before);
  const scrolling = kind === 'scroll' || kind === 'directory-scroll';
  let matchedRegion = null, matchGeometryMs = 0, geometryError = null;
  if (matchRegion) {
    // Read geometry only after capture has ended; never adjust presentation timestamps.
    const geometryStart = performance.now();
    try {
      if (scrolling) throw new Error('A match rectangle is not supported for motion measurements');
      matchedRegion = await matchRegion({ region, width: reference.width, height: reference.height });
      const { x, y, width, height, version, unsafeReason } = matchedRegion;
      if (unsafeReason) throw new Error(unsafeReason);
      if (typeof version !== 'string' || !version || ![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > reference.width || y + height > reference.height)
        throw new Error('Invalid physical match rectangle or missing ROI version');
    } catch (error) {
      geometryError = error instanceof Error ? error.message || error.name || 'Error' : String(error) || 'Unknown match-region error';
    }
    matchGeometryMs = performance.now() - geometryStart;
  }
  if (!geometryError && pixelsEqual(old, reference, matchedRegion)) {
    if (!matchRegion) throw new Error(`${id}: semantic outcome did not produce changed target pixels`);
    geometryError = 'Semantic outcome did not produce changed glyph pixels inside the match rectangle';
  }
  const settledFrame = geometryError ? null : capture.frames.find(f => f.at >= inputAt && pixelsEqual(decode(f.png), reference, matchedRegion));
  let motion = null;
  const frame = geometryError ? null : scrolling ? capture.frames.find(f => f.at >= inputAt && (motion = verticalMotion(old, decode(f.png)))) : settledFrame;
  if (persistFrames || !frame) {
    fs.writeFileSync(path.join(directory, `${id}-before.png`), before);
    fs.writeFileSync(path.join(directory, `${id}-reference.png`), Buffer.from(capture.reference, 'base64'));
    capture.frames.forEach((f, index) => fs.writeFileSync(path.join(directory, `${id}-frame-${index}.png`), Buffer.from(f.png, 'base64')));
    const diagnostic = { inputAt, clock, trustedInput, region, matchRegion: matchedRegion, matchGeometryMs, geometryError, reference: { width: reference.width, height: reference.height }, frames: capture.frames.map(f => ({ at: f.at, width: decode(f.png).width, height: decode(f.png).height })) };
    fs.writeFileSync(path.join(directory, `${id}-diagnostic.json`), JSON.stringify(diagnostic, null, 2));
  }
  if (geometryError) throw new Error(`${id}: ${geometryError}`);
  if (!frame) throw new Error(`${id}: no presented ${scrolling ? 'verified vertical content movement' : 'verified outcome'} (${capture.frames.length} captures)`);
  const artifact = path.join(directory, `${id}.png`);
  fs.writeFileSync(artifact, Buffer.from(frame.png, 'base64'));
  if (scrolling) fs.writeFileSync(path.join(directory, `${id}-settled.png`), Buffer.from(capture.reference, 'base64'));
  const result = { id, kind, inputAt, nativeDispatch, trustedInputAt, automationDispatchAt: clock.at, trustedInput, presentedCaptureAt: frame.at, durationMs: frame.at - inputAt, motion, finalScroll, settledDurationMs: settledFrame ? settledFrame.at - inputAt : null, capturedFrames: capture.captureStats.totalReadbacks, retainedFrames: capture.frames.length, captureStats: capture.captureStats, referenceCaptureMs: capture.referenceCaptureMs, encodingMs: capture.encodingMs, comparisonMs: performance.now() - comparisonStart, callbackMs: capture.captureStats.metadataMs, region, screenshot: path.basename(artifact), sha256: createHash('sha256').update(Buffer.from(frame.png, 'base64')).digest('hex'), method: scrolling ? 'Electron native input -> first captured compositor image with verified vertical text/row movement; final scroll result separately checked' : 'Electron native input -> first captured compositor image matching verified changed target pixels' };
  if (matchRegion) Object.assign(result, { matchRegion: matchedRegion, matchGeometryMs });
  fs.writeFileSync(path.join(directory, `${id}.json`), JSON.stringify({ ...result, frames: capture.frames.map(({ png, ...frame }) => frame) }, null, 2));
  return result;
}
module.exports = { measure };
