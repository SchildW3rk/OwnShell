'use strict';
const { nativeInput } = require('./mixed-ui.cjs');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function dragSeparator(app, from, to) {
  await nativeInput(app, [{ type: 'mouseMove', ...from }, { type: 'mouseDown', button: 'left', clickCount: 1, ...from }]);
  for (let step = 1; step <= 12; step++) {
    await nativeInput(app, [{ type: 'mouseMove', modifiers: ['leftButtonDown'], x: Math.round(from.x + (to.x - from.x) * step / 12), y: Math.round(from.y + (to.y - from.y) * step / 12) }]);
    await wait(16);
  }
  await nativeInput(app, [{ type: 'mouseUp', button: 'left', clickCount: 1, ...to }]);
  await wait(250);
}
// Use the same public resize handles a user drags; retain every background pane.
async function expandPane({ app, page }, pane) {
  const before = await pane.boundingBox();
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  const drags = [];
  for (const axis of ['row', 'column']) for (const side of ['before', 'after']) {
    const box = await pane.boundingBox();
    const candidates = [];
    const handles = await page.getByRole('separator').evaluateAll(elements => elements.map(element => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    }));
    for (const h of handles) {
      if (axis === 'row' ? h.width <= h.height : h.height <= h.width) continue;
      const transverse = axis === 'row' ? box.x + box.width / 2 : box.y + box.height / 2;
      const low = axis === 'row' ? h.x : h.y, high = low + (axis === 'row' ? h.width : h.height);
      const edge = axis === 'row' ? (side === 'before' ? box.y : box.y + box.height) : (side === 'before' ? box.x : box.x + box.width);
      const handleEdge = axis === 'row' ? (side === 'before' ? h.y + h.height : h.y) : (side === 'before' ? h.x + h.width : h.x);
      if (transverse >= low && transverse <= high && Math.abs(edge - handleEdge) < 8) candidates.push(h);
    }
    if (!candidates.length) continue;
    const h = candidates[0];
    const from = { x: Math.round(h.x + h.width / 2), y: Math.round(h.y + h.height / 2) };
    const delta = side === 'before' ? -250 : 250;
    const to = { x: Math.max(5, Math.min(viewport.width - 5, from.x + (axis === 'column' ? delta : 0))), y: Math.max(5, Math.min(viewport.height - 5, from.y + (axis === 'row' ? delta : 0))) };
    await dragSeparator(app, from, to);
    drags.push({ axis, side, from, to });
  }
  return { before, after: await pane.boundingBox(), drags, source: 'Native pointer input through existing workspace separators; no pane/session removed or DOM styles changed.' };
}
module.exports = { expandPane, dragSeparator };
