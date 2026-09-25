const PHYSICS = {
  meltDelayMs: 2000,
  gravity: 42,          // pixels per second squared
  maxDripLength: 105,  // pixels
  massWarmupMs: 1100,
  dripSpacing: 52,      // pixels along a stroke
  waxWidth: 13,         // fresh crayon width in pixels
  massGain: 9,          // extra width when warm
  eraserRadius: 16,     // pixels
};
const MAX_CANVAS_PIXELS = 3_000_000;

const canvas = document.querySelector('#drawing');
const status = document.querySelector('#status');
const clearButton = document.querySelector('#clear');
const colors = [...document.querySelectorAll('.crayon')];
const eraserButtons = [...document.querySelectorAll('[data-tool]')];
const moveButton = document.querySelector('#move');
const brushPreview = document.querySelector('#brush-preview');
const sizeControl = document.querySelector('.size-control');
const sizeSlider = document.querySelector('#size');
const meltSlider = document.querySelector('#melt');
const meltValue = document.querySelector('#melt-value');
const ctx = canvas.getContext('2d');
const pigment = document.createElement('canvas');
const pigmentCtx = pigment.getContext('2d');

let selectedColor = colors[0].dataset.color;
let tool = 'crayon';
let crayonWidth = PHYSICS.waxWidth;
const eraserRadii = { mark: PHYSICS.eraserRadius, drip: PHYSICS.eraserRadius };
let lastErasePoint = null;
let activePointerId = null;
let panPoint = null;
let spaceDown = false;
const camera = { x: 0, y: 0 };
let strokes = [];
let currentStroke = null;
let width = 0;
let height = 0;
let frame = 0;
let wakeTimer = 0;

function unitPoint(event) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: camera.x + Math.max(0, Math.min(bounds.width, event.clientX - bounds.left)),
    y: camera.y + Math.max(0, Math.min(bounds.height, event.clientY - bounds.top)),
  };
}

function hash(value) {
  const raw = Math.sin(value * 127.1 + 78.233) * 43758.5453;
  return raw - Math.floor(raw);
}

function pointToScreen(point) {
  return { x: point.x - camera.x, y: point.y - camera.y };
}

function stamp(point, stroke, index) {
  const { x, y } = pointToScreen(point);
  pigmentCtx.fillStyle = stroke.color;

  // Dense center with gaps and short irregular flakes at the edges.
  for (let flake = 0; flake < 11; flake++) {
    const seed = index * 31 + flake * 7;
    const angle = hash(seed + 1) * Math.PI * 2;
    const radius = Math.sqrt(hash(seed + 2)) * stroke.width * .53;
    const size = .7 + hash(seed + 3) * 2.2;
    pigmentCtx.globalAlpha = .18 + hash(seed + 4) * .52;
    pigmentCtx.fillRect(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, size, .7 + hash(seed + 5) * 1.4);
  }
  pigmentCtx.globalAlpha = 1;
}

function drawFreshSegment(a, b, stroke, startIndex) {
  const first = pointToScreen(a);
  const last = pointToScreen(b);
  const length = Math.hypot(last.x - first.x, last.y - first.y);
  const steps = Math.max(1, Math.ceil(length / 2.2));

  pigmentCtx.strokeStyle = stroke.color;
  pigmentCtx.lineCap = 'round';
  pigmentCtx.lineWidth = stroke.width * .82;
  pigmentCtx.globalAlpha = .18;
  pigmentCtx.beginPath();
  pigmentCtx.moveTo(first.x, first.y);
  pigmentCtx.lineTo(last.x, last.y);
  pigmentCtx.stroke();
  pigmentCtx.globalAlpha = 1;

  for (let step = 0; step <= steps; step++) {
    stamp({ x: a.x + (b.x - a.x) * step / steps, y: a.y + (b.y - a.y) * step / steps }, stroke, startIndex * 1000 + step);
  }
}

function cachePigment(stroke) {
  const margin = stroke.width + 4;
  const ratio = canvas.width / width;
  const left = Math.max(0, Math.floor((stroke.bounds.minX - camera.x - margin) * ratio));
  const top = Math.max(0, Math.floor((stroke.bounds.minY - camera.y - margin) * ratio));
  const right = Math.min(pigment.width, Math.ceil((stroke.bounds.maxX - camera.x + margin) * ratio));
  const bottom = Math.min(pigment.height, Math.ceil((stroke.bounds.maxY - camera.y + margin) * ratio));
  if (right > left && bottom > top) {
    const wax = document.createElement('canvas');
    wax.width = right - left;
    wax.height = bottom - top;
    const target = wax.getContext('2d');
    target.drawImage(pigment, left, top, wax.width, wax.height, 0, 0, wax.width, wax.height);
    stroke.raster = { canvas: wax, x: camera.x + left / ratio, y: camera.y + top / ratio, width: wax.width / ratio, height: wax.height / ratio };
    target.setTransform(ratio, 0, 0, ratio, -stroke.raster.x * ratio, -stroke.raster.y * ratio);
  }
  pigmentCtx.clearRect(0, 0, width, height);
}

function resize() {
  const bounds = canvas.getBoundingClientRect();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(MAX_CANVAS_PIXELS / (bounds.width * bounds.height)));
  const backingWidth = Math.round(bounds.width * pixelRatio);
  const backingHeight = Math.round(bounds.height * pixelRatio);
  if (width === bounds.width && height === bounds.height && canvas.width === backingWidth && canvas.height === backingHeight) return;

  let previousPigment;
  const previousWidth = width;
  const previousHeight = height;
  if (width && height) {
    previousPigment = document.createElement('canvas');
    previousPigment.width = pigment.width;
    previousPigment.height = pigment.height;
    previousPigment.getContext('2d').drawImage(pigment, 0, 0);
  }
  width = bounds.width;
  height = bounds.height;
  canvas.width = pigment.width = backingWidth;
  canvas.height = pigment.height = backingHeight;
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  pigmentCtx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  if (previousPigment) pigmentCtx.drawImage(previousPigment, 0, 0, previousWidth, previousHeight);
  render(performance.now());
}

function extendMeltWindow(stroke, start, end) {
  // A held stroke can start moving again after its earlier wax has settled.
  const expired = performance.now() >= stroke.meltEndAt;
  if (expired) stroke.meltStartAt = start;
  stroke.meltEndAt = Math.max(stroke.meltEndAt, end);
  if (expired) scheduleMelt();
}

function addDrip(stroke, point) {
  if (!stroke.dripScale) return;
  const index = stroke.drips.length;
  const seed = stroke.id * 19 + index * 17;
  const drip = {
    point,
    createdAt: point.createdAt,
    delay: hash(seed + 2) * 1250,
    length: .45 + hash(seed + 3) * .65,
    maxLength: PHYSICS.maxDripLength * stroke.dripScale,
    width: (3.5 + hash(seed + 4) * 4.5) * stroke.width / PHYSICS.waxWidth,
    bend: (hash(seed + 5) - .5) * 17,
  };
  stroke.drips.push(drip);
  const start = drip.createdAt + PHYSICS.meltDelayMs + drip.delay;
  const fallMs = PHYSICS.gravity > 0
    ? Math.sqrt(2 * drip.maxLength * drip.length / PHYSICS.gravity) * 1000
    : 0;
  extendMeltWindow(stroke, start, start + fallMs);
}

function addPoint(stroke, point) {
  const previous = stroke.points.at(-1);
  if (!previous) {
    point.createdAt = stroke.startedAt;
    stamp(point, stroke, 0);
    stroke.points.push(point);
    stroke.bounds = { minX: point.x, maxX: point.x, minY: point.y, maxY: point.y };
    stroke.visiblePoints++;
    addDrip(stroke, point);
    return;
  }

  const distance = Math.hypot(point.x - previous.x, point.y - previous.y);
  if (distance < 1.5) return;
  const steps = Math.ceil(distance / 8);
  const createdAt = performance.now();
  const meltStart = createdAt + PHYSICS.meltDelayMs;
  extendMeltWindow(stroke, meltStart, meltStart + PHYSICS.massWarmupMs);
  for (let step = 1; step <= steps; step++) {
    const next = {
      x: previous.x + (point.x - previous.x) * step / steps,
      y: previous.y + (point.y - previous.y) * step / steps,
      createdAt,
    };
    const last = stroke.points.at(-1);
    stroke.travel += distance / steps;
    drawFreshSegment(last, next, stroke, stroke.points.length);
    if (stroke.dripScale && stroke.travel - stroke.lastDripDistance >= PHYSICS.dripSpacing / stroke.dripScale) {
      stroke.lastDripDistance = stroke.travel;
      addDrip(stroke, next);
    }
    stroke.points.push(next);
    stroke.bounds.minX = Math.min(stroke.bounds.minX, next.x);
    stroke.bounds.maxX = Math.max(stroke.bounds.maxX, next.x);
    stroke.bounds.minY = Math.min(stroke.bounds.minY, next.y);
    stroke.bounds.maxY = Math.max(stroke.bounds.maxY, next.y);
    stroke.visiblePoints++;
  }
}

function drawMass(stroke, warmth, meltCutoff) {
  if (stroke.visiblePoints < 2) return;
  ctx.beginPath();
  let connected = false;
  stroke.points.forEach(point => {
    if (point.erased || point.createdAt > meltCutoff) {
      connected = false;
      return;
    }
    const { x, y } = point;
    if (!connected) ctx.moveTo(x, y + warmth * 2.3);
    else ctx.lineTo(x, y + warmth * 2.3);
    connected = true;
  });
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width * (1 + PHYSICS.massGain / PHYSICS.waxWidth * warmth);
  ctx.globalAlpha = .35 + warmth * .3;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function dripLength(drip, now) {
  if (drip.frozenLength !== undefined) return drip.frozenLength;
  const seconds = Math.max(0, (now - drip.createdAt - PHYSICS.meltDelayMs - drip.delay) / 1000);
  return Math.min(drip.maxLength * drip.length, .5 * PHYSICS.gravity * seconds * seconds);
}

function dripPosition(drip, x, y, length, t) {
  const bend = drip.bend;
  const endX = x + bend * Math.min(1, length / 90);
  const inverse = 1 - t;
  return {
    x: inverse ** 3 * x + 3 * inverse ** 2 * t * (x - bend * .2) + 3 * inverse * t ** 2 * endX + t ** 3 * endX,
    y: inverse ** 3 * (y + 3) + 3 * inverse ** 2 * t * (y + length * .33) + 3 * inverse * t ** 2 * (y + length * .72) + t ** 3 * (y + length),
  };
}

function paintDrip(target, stroke, drip, x, y, length) {
  const bend = drip.bend;
  const endX = x + bend * Math.min(1, length / 90);
  target.beginPath();
  target.moveTo(x, y + 3);
  target.bezierCurveTo(x - bend * .2, y + length * .33, endX, y + length * .72, endX, y + length);
  target.strokeStyle = stroke.color;
  target.lineWidth = drip.width;
  target.lineCap = 'round';
  target.globalAlpha = .82;
  target.stroke();
  target.beginPath();
  target.ellipse(endX, y + length, drip.width * .85, drip.width * 1.25, 0, 0, Math.PI * 2);
  target.fillStyle = stroke.color;
  target.fill();
  target.globalAlpha = .23;
  target.strokeStyle = '#fff8e5';
  target.lineWidth = 1;
  target.beginPath();
  target.moveTo(x - drip.width * .2, y + 9);
  target.lineTo(endX - drip.width * .25, y + length * .72);
  target.stroke();
  target.globalAlpha = 1;
}

function eraseRaster(raster, erase) {
  const target = raster.canvas.getContext('2d');
  const start = erase.a;
  const end = erase.b;
  const radius = erase.radius;
  target.save();
  target.globalCompositeOperation = 'destination-out';
  target.lineWidth = radius * 2;
  target.lineCap = 'round';
  target.beginPath();
  target.moveTo(start.x, start.y);
  target.lineTo(end.x, end.y);
  target.stroke();
  target.beginPath();
  target.arc(end.x, end.y, radius, 0, Math.PI * 2);
  target.fill();
  target.restore();
}

function makeDripRaster(stroke, drip, x, y, length) {
  const bend = drip.bend;
  const left = Math.floor(Math.min(x, x + bend) - drip.width * 2 - 2);
  const top = Math.floor(y - drip.width * 2 - 2);
  const rasterWidth = Math.ceil(Math.abs(bend) + drip.width * 4 + 4);
  const rasterHeight = Math.ceil(length + drip.width * 4 + 4);
  const ratio = canvas.width / width;
  const wax = document.createElement('canvas');
  wax.width = Math.ceil(rasterWidth * ratio);
  wax.height = Math.ceil(rasterHeight * ratio);
  const target = wax.getContext('2d');
  target.setTransform(ratio, 0, 0, ratio, -left * ratio, -top * ratio);
  paintDrip(target, stroke, drip, x, y, length);
  drip.raster = { canvas: wax, x: left, y: top, width: wax.width / ratio, height: wax.height / ratio };
  for (const erase of drip.erases) eraseRaster(drip.raster, erase);
}

function drawDrips(stroke, now) {
  for (const drip of stroke.drips) {
    if (drip.erased) continue;
    const { x, y } = drip.point;
    const length = dripLength(drip, now);
    if (length <= 0) continue;
    if (drip.erases) {
      if (!drip.raster) makeDripRaster(stroke, drip, x, y, length);
      const raster = drip.raster;
      ctx.drawImage(raster.canvas, raster.x, raster.y, raster.width, raster.height);
      continue;
    }
    paintDrip(ctx, stroke, drip, x, y, length);
  }
}

function strokeVisible(stroke) {
  const margin = stroke.width + 20;
  const dripReach = PHYSICS.maxDripLength * stroke.dripScale * 1.1;
  return stroke.bounds.maxX + margin >= camera.x && stroke.bounds.minX - margin <= camera.x + width &&
    stroke.bounds.maxY + dripReach + margin >= camera.y && stroke.bounds.minY - margin <= camera.y + height;
}

function render(now) {
  ctx.clearRect(0, 0, width, height);
  let melting = false;
  let warming = false;
  const visible = [];
  ctx.save();
  ctx.translate(-camera.x, -camera.y);
  for (const stroke of strokes) {
    const elapsed = now - stroke.startedAt;
    if (stroke === currentStroke || elapsed < PHYSICS.meltDelayMs) warming = true;
    if (!strokeVisible(stroke)) continue;
    visible.push(stroke);
    if (elapsed >= PHYSICS.meltDelayMs) {
      const warmth = Math.min(1, (elapsed - PHYSICS.meltDelayMs) / PHYSICS.massWarmupMs);
      drawMass(stroke, warmth, now - PHYSICS.meltDelayMs);
    }
    melting ||= now >= stroke.meltStartAt && now < stroke.meltEndAt;
  }
  for (const stroke of visible) {
    if (!stroke.raster) continue;
    const raster = stroke.raster;
    ctx.drawImage(raster.canvas, raster.x, raster.y, raster.width, raster.height);
  }
  ctx.restore();
  ctx.drawImage(pigment, 0, 0, width, height);
  ctx.save();
  ctx.translate(-camera.x, -camera.y);
  for (const stroke of visible) drawDrips(stroke, now);
  ctx.restore();
  const nextStatus = !strokes.length ? 'READY TO DRAW' : melting ? 'WAX IN MOTION' : warming ? 'WARMING UP' : 'MELTED';
  if (status.textContent !== nextStatus) status.textContent = nextStatus;
}

function tick(now) {
  frame = 0;
  render(now);
  if (strokes.some(stroke => strokeVisible(stroke) && now >= stroke.meltStartAt && now < stroke.meltEndAt)) {
    frame = requestAnimationFrame(tick);
  } else if (!wakeTimer) {
    scheduleMelt();
  }
}

function scheduleMelt() {
  clearTimeout(wakeTimer);
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  const now = performance.now();
  const visible = strokes.filter(strokeVisible);
  const next = visible
    .filter(stroke => now < stroke.meltStartAt)
    .map(stroke => stroke.meltStartAt - now);
  const active = visible.some(stroke => now >= stroke.meltStartAt && now < stroke.meltEndAt);
  if (active) frame = requestAnimationFrame(tick);
  else if (next.length) wakeTimer = setTimeout(() => {
    wakeTimer = 0;
    if (!frame) frame = requestAnimationFrame(tick);
  }, Math.max(0, Math.min(...next)));
}

function queueRender() {
  if (!frame) frame = requestAnimationFrame(tick);
}

function eraseSegment(a, b) {
  const start = a;
  const end = b;
  const radius = eraserRadii[tool];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const within = (x, y, reach) => {
    const t = lengthSquared ? Math.max(0, Math.min(1, ((x - start.x) * dx + (y - start.y) * dy) / lengthSquared)) : 0;
    return (x - start.x - t * dx) ** 2 + (y - start.y - t * dy) ** 2 <= reach ** 2;
  };

  const now = performance.now();
  for (const stroke of strokes) {
    const side = radius + stroke.width + 20;
    const below = tool === 'drip' ? PHYSICS.maxDripLength * stroke.dripScale * 1.1 : 0;
    if (Math.max(start.x, end.x) + side < stroke.bounds.minX || Math.min(start.x, end.x) - side > stroke.bounds.maxX ||
        Math.max(start.y, end.y) + side < stroke.bounds.minY || Math.min(start.y, end.y) - side - below > stroke.bounds.maxY) continue;
    if (tool === 'mark') {
      if (stroke.raster) eraseRaster(stroke.raster, { a, b, radius });
      for (const point of stroke.points) {
        if (point.erased) continue;
        const { x, y } = point;
        if (within(x, y, radius)) {
          point.erased = true;
          stroke.visiblePoints--;
        }
      }
      for (const drip of stroke.drips) {
        if (drip.point.erased && dripLength(drip, now) <= 0) drip.erased = true;
      }
      continue;
    }
    for (const drip of stroke.drips) {
      if (drip.erased) continue;
      const { x, y } = drip.point;
      const length = dripLength(drip, now);
      if (length <= 0) continue;
      const reach = radius + drip.width * 1.25;
      const bendReach = Math.abs(drip.bend) * 1.2;
      if (Math.max(start.x, end.x) + reach < x - bendReach || Math.min(start.x, end.x) - reach > x + bendReach ||
          Math.max(start.y, end.y) + reach < y || Math.min(start.y, end.y) - reach > y + length) continue;
      const steps = Math.max(8, Math.ceil(length / 3));
      for (let i = 0; i <= steps; i++) {
        const point = dripPosition(drip, x, y, length, i / steps);
        if (within(point.x, point.y, reach)) {
          if (!drip.erases) {
            drip.frozenLength = length;
            drip.erases = [];
          }
          const erase = { a, b, radius };
          drip.erases.push(erase);
          if (drip.raster) eraseRaster(drip.raster, erase);
          break;
        }
      }
    }
  }
  if (tool === 'mark') strokes = strokes.filter(stroke => stroke.visiblePoints > 0 || stroke.drips.some(drip => !drip.erased));
}

function showBrushPreview(event) {
  if (tool === 'move' || spaceDown || panPoint) {
    brushPreview.style.visibility = 'hidden';
    return;
  }
  const bounds = canvas.getBoundingClientRect();
  brushPreview.style.left = `${event.clientX - bounds.left}px`;
  brushPreview.style.top = `${event.clientY - bounds.top}px`;
  brushPreview.style.visibility = 'visible';
}

canvas.addEventListener('pointerenter', event => {
  if (event.pointerType !== 'touch') showBrushPreview(event);
});

canvas.addEventListener('pointerdown', event => {
  if (activePointerId !== null) return;
  const panning = tool === 'move' || spaceDown || event.button === 1;
  if (event.button !== 0 && event.button !== 1) return;
  if (event.button === 1) event.preventDefault();
  canvas.focus({ preventScroll: true });
  activePointerId = event.pointerId;
  canvas.setPointerCapture(event.pointerId);
  if (panning) {
    panPoint = { x: event.clientX, y: event.clientY };
    canvas.closest('.paper').classList.add('panning');
    brushPreview.style.visibility = 'hidden';
    return;
  }
  showBrushPreview(event);
  if (tool !== 'crayon') {
    lastErasePoint = unitPoint(event);
    eraseSegment(lastErasePoint, lastErasePoint);
    queueRender();
    return;
  }
  const now = performance.now();
  currentStroke = {
    id: strokes.length + now, color: selectedColor, width: crayonWidth, dripScale: Number(meltSlider.value) / 50, startedAt: now,
    meltStartAt: now + PHYSICS.meltDelayMs, meltEndAt: now + PHYSICS.meltDelayMs + PHYSICS.massWarmupMs,
    points: [], drips: [], visiblePoints: 0, travel: 0, lastDripDistance: 0,
  };
  strokes.push(currentStroke);
  addPoint(currentStroke, unitPoint(event));
  scheduleMelt();
  queueRender();
});

canvas.addEventListener('pointermove', event => {
  if (activePointerId !== null && event.pointerId !== activePointerId) return;
  if (panPoint) {
    camera.x -= event.clientX - panPoint.x;
    camera.y -= event.clientY - panPoint.y;
    panPoint = { x: event.clientX, y: event.clientY };
    queueRender();
    return;
  }
  showBrushPreview(event);
  if (!currentStroke && !lastErasePoint) return;
  const samples = event.getCoalescedEvents?.();
  for (const sample of samples?.length ? samples : [event]) {
    const point = unitPoint(sample);
    if (lastErasePoint) {
      eraseSegment(lastErasePoint, point);
      lastErasePoint = point;
    } else {
      addPoint(currentStroke, point);
    }
  }
  queueRender();
});

function finishStroke(event) {
  if (event.pointerId !== activePointerId) return;
  activePointerId = null;
  if (panPoint) {
    panPoint = null;
    canvas.closest('.paper').classList.remove('panning');
    return;
  }
  if (event.pointerType === 'touch' || event.type === 'pointercancel') brushPreview.style.visibility = 'hidden';
  if (lastErasePoint) {
    lastErasePoint = null;
    render(performance.now());
    return;
  }
  if (!currentStroke) return;
  cachePigment(currentStroke);
  currentStroke = null;
  render(performance.now());
  scheduleMelt();
}
canvas.addEventListener('pointerup', finishStroke);
canvas.addEventListener('pointercancel', finishStroke);
canvas.addEventListener('lostpointercapture', finishStroke);
canvas.addEventListener('pointerleave', () => { brushPreview.style.visibility = 'hidden'; });
canvas.addEventListener('auxclick', event => { if (event.button === 1) event.preventDefault(); });
canvas.addEventListener('wheel', event => {
  event.preventDefault();
  camera.x += event.deltaX;
  camera.y += event.deltaY;
  queueRender();
}, { passive: false });

window.addEventListener('keydown', event => {
  if (event.code !== 'Space' || ['BUTTON', 'INPUT'].includes(document.activeElement.tagName)) return;
  event.preventDefault();
  spaceDown = true;
  canvas.closest('.paper').classList.add('moving');
  brushPreview.style.visibility = 'hidden';
});
window.addEventListener('keyup', event => {
  if (event.code !== 'Space') return;
  spaceDown = false;
  if (tool !== 'move') canvas.closest('.paper').classList.remove('moving');
});

colors.forEach(button => button.addEventListener('click', () => {
  selectedColor = button.dataset.color;
  tool = 'crayon';
  eraserButtons.forEach(eraser => {
    eraser.classList.remove('selected');
    eraser.setAttribute('aria-pressed', 'false');
  });
  moveButton.classList.remove('selected');
  moveButton.setAttribute('aria-pressed', 'false');
  canvas.closest('.paper').classList.remove('moving');
  brushPreview.style.visibility = 'hidden';
  colors.forEach(color => {
    const active = color === button;
    color.classList.toggle('selected', active);
    color.setAttribute('aria-pressed', String(active));
  });
  updateSizeControl();
}));

eraserButtons.forEach(button => button.addEventListener('click', () => {
  tool = button.dataset.tool;
  moveButton.classList.remove('selected');
  moveButton.setAttribute('aria-pressed', 'false');
  canvas.closest('.paper').classList.remove('moving');
  eraserButtons.forEach(eraser => {
    const active = eraser === button;
    eraser.classList.toggle('selected', active);
    eraser.setAttribute('aria-pressed', String(active));
  });
  colors.forEach(color => {
    color.classList.remove('selected');
    color.setAttribute('aria-pressed', 'false');
  });
  updateSizeControl();
}));

moveButton.addEventListener('click', () => {
  tool = 'move';
  moveButton.classList.add('selected');
  moveButton.setAttribute('aria-pressed', 'true');
  canvas.closest('.paper').classList.add('moving');
  colors.forEach(button => { button.classList.remove('selected'); button.setAttribute('aria-pressed', 'false'); });
  eraserButtons.forEach(button => { button.classList.remove('selected'); button.setAttribute('aria-pressed', 'false'); });
  brushPreview.style.visibility = 'hidden';
  updateSizeControl();
});

function updateSizeControl() {
  sizeSlider.disabled = tool === 'move';
  sizeControl.style.opacity = tool === 'move' ? '.45' : '1';
  if (tool === 'move') return;
  const erasing = tool !== 'crayon';
  sizeSlider.min = 5;
  sizeSlider.max = erasing ? 40 : 32;
  sizeSlider.value = erasing ? eraserRadii[tool] : crayonWidth;
  sizeSlider.setAttribute('aria-label', erasing ? `${tool === 'mark' ? 'Mark' : 'Drip'} eraser size` : 'Crayon size');
  sizeControl.style.setProperty('--tool-color', erasing ? '#8b6e67' : selectedColor);
  const diameter = erasing ? eraserRadii[tool] * 2 : (currentStroke?.width ?? crayonWidth);
  brushPreview.style.width = `${diameter}px`;
  brushPreview.style.height = `${diameter}px`;
  brushPreview.style.setProperty('--preview-color', erasing ? '#766c63' : selectedColor);
}

sizeSlider.addEventListener('input', () => {
  if (tool !== 'crayon') eraserRadii[tool] = Number(sizeSlider.value);
  else crayonWidth = Number(sizeSlider.value);
  updateSizeControl();
});

meltSlider.addEventListener('input', () => { meltValue.textContent = `${meltSlider.value}%`; });

clearButton.addEventListener('click', () => {
  clearTimeout(wakeTimer);
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  strokes = [];
  currentStroke = null;
  lastErasePoint = null;
  panPoint = null;
  activePointerId = null;
  canvas.closest('.paper').classList.remove('panning');
  pigmentCtx.clearRect(0, 0, width, height);
  render(performance.now());
});

resize();
updateSizeControl();
new ResizeObserver(resize).observe(canvas);
