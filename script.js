const PHYSICS = {
  meltDelayMs: 2000,
  gravity: 58,          // pixels per second squared
  maxDripLength: 175,  // pixels
  meltDurationMs: 7800,
  dripSpacing: 34,      // pixels along a stroke
  waxWidth: 13,         // fresh crayon width in pixels
  massGain: 9,          // extra width when warm
  eraserRadius: 30,     // pixels
};
const MAX_CANVAS_PIXELS = 3_000_000;

const canvas = document.querySelector('#drawing');
const status = document.querySelector('#status');
const clearButton = document.querySelector('#clear');
const colors = [...document.querySelectorAll('.crayon')];
const eraserButton = document.querySelector('#eraser');
const eraserPreview = document.querySelector('#eraser-preview');
const ctx = canvas.getContext('2d');
const pigment = document.createElement('canvas');
const pigmentCtx = pigment.getContext('2d');

let selectedColor = colors[0].dataset.color;
let erasing = false;
let lastErasePoint = null;
let activePointerId = null;
let strokes = [];
let currentStroke = null;
let width = 0;
let height = 0;
let frame = 0;
let wakeTimer = 0;

function unitPoint(event) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
    y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
  };
}

function hash(value) {
  const raw = Math.sin(value * 127.1 + 78.233) * 43758.5453;
  return raw - Math.floor(raw);
}

function pointToPixels(point) {
  return { x: point.x * width, y: point.y * height };
}

function stamp(point, color, index) {
  const { x, y } = pointToPixels(point);
  pigmentCtx.fillStyle = color;

  // Dense center with gaps and short irregular flakes at the edges.
  for (let flake = 0; flake < 11; flake++) {
    const seed = index * 31 + flake * 7;
    const angle = hash(seed + 1) * Math.PI * 2;
    const radius = Math.sqrt(hash(seed + 2)) * PHYSICS.waxWidth * .53;
    const size = .7 + hash(seed + 3) * 2.2;
    pigmentCtx.globalAlpha = .18 + hash(seed + 4) * .52;
    pigmentCtx.fillRect(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, size, .7 + hash(seed + 5) * 1.4);
  }
  pigmentCtx.globalAlpha = 1;
}

function drawFreshSegment(a, b, color, startIndex) {
  const first = pointToPixels(a);
  const last = pointToPixels(b);
  const length = Math.hypot(last.x - first.x, last.y - first.y);
  const steps = Math.max(1, Math.ceil(length / 2.2));

  pigmentCtx.strokeStyle = color;
  pigmentCtx.lineCap = 'round';
  pigmentCtx.lineWidth = PHYSICS.waxWidth * .82;
  pigmentCtx.globalAlpha = .18;
  pigmentCtx.beginPath();
  pigmentCtx.moveTo(first.x, first.y);
  pigmentCtx.lineTo(last.x, last.y);
  pigmentCtx.stroke();
  pigmentCtx.globalAlpha = 1;

  for (let step = 0; step <= steps; step++) {
    stamp({ x: a.x + (b.x - a.x) * step / steps, y: a.y + (b.y - a.y) * step / steps }, color, startIndex * 1000 + step);
  }
}

function resize() {
  const bounds = canvas.getBoundingClientRect();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(MAX_CANVAS_PIXELS / (bounds.width * bounds.height)));
  const backingWidth = Math.round(bounds.width * pixelRatio);
  const backingHeight = Math.round(bounds.height * pixelRatio);
  if (width === bounds.width && height === bounds.height && canvas.width === backingWidth && canvas.height === backingHeight) return;

  let previousPigment;
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
  if (previousPigment) pigmentCtx.drawImage(previousPigment, 0, 0, width, height);
  render(performance.now());
}

function addDrip(stroke, point) {
  const index = stroke.drips.length;
  const seed = stroke.id * 19 + index * 17;
  stroke.drips.push({
    point,
    delay: hash(seed + 2) * 1250,
    length: .45 + hash(seed + 3) * .65,
    width: 3.5 + hash(seed + 4) * 4.5,
    bend: (hash(seed + 5) - .5) * 17,
  });
}

function addPoint(stroke, point) {
  const previous = stroke.points.at(-1);
  if (!previous) {
    stamp(point, stroke.color, 0);
    stroke.points.push(point);
    stroke.visiblePoints++;
    return;
  }

  const distance = Math.hypot((point.x - previous.x) * width, (point.y - previous.y) * height);
  if (distance < 1.5) return;
  const steps = Math.ceil(distance / 8);
  for (let step = 1; step <= steps; step++) {
    const next = {
      x: previous.x + (point.x - previous.x) * step / steps,
      y: previous.y + (point.y - previous.y) * step / steps,
    };
    const last = stroke.points.at(-1);
    stroke.travel += distance / steps;
    drawFreshSegment(last, next, stroke.color, stroke.points.length);
    if (stroke.travel - stroke.lastDripAt >= PHYSICS.dripSpacing) {
      stroke.lastDripAt = stroke.travel;
      addDrip(stroke, next);
    }
    stroke.points.push(next);
    stroke.visiblePoints++;
  }
}

function drawMass(stroke, warmth) {
  if (stroke.points.length < 2) return;
  ctx.beginPath();
  let connected = false;
  stroke.points.forEach(point => {
    if (point.erased) {
      connected = false;
      return;
    }
    const { x, y } = pointToPixels(point);
    if (!connected) ctx.moveTo(x, y + warmth * 2.3);
    else ctx.lineTo(x, y + warmth * 2.3);
    connected = true;
  });
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = PHYSICS.waxWidth + PHYSICS.massGain * warmth;
  ctx.globalAlpha = .35 + warmth * .3;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawDrips(stroke, elapsed) {
  for (const drip of stroke.drips) {
    if (drip.erased || drip.point.erased) continue;
    const seconds = Math.max(0, (elapsed - PHYSICS.meltDelayMs - drip.delay) / 1000);
    if (seconds === 0) continue;
    const { x, y } = pointToPixels(drip.point);
    const length = Math.min(PHYSICS.maxDripLength * drip.length, .5 * PHYSICS.gravity * seconds * seconds, height - y - 15);
    if (length <= 0) continue;
    const endX = x + drip.bend * Math.min(1, length / 90);

    ctx.beginPath();
    ctx.moveTo(x, y + 3);
    ctx.bezierCurveTo(x - drip.bend * .2, y + length * .33, endX, y + length * .72, endX, y + length);
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = drip.width;
    ctx.lineCap = 'round';
    ctx.globalAlpha = .82;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(endX, y + length, drip.width * .85, drip.width * 1.25, 0, 0, Math.PI * 2);
    ctx.fillStyle = stroke.color;
    ctx.fill();
    ctx.globalAlpha = .23;
    ctx.strokeStyle = '#fff8e5';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - drip.width * .2, y + 9);
    ctx.lineTo(endX - drip.width * .25, y + length * .72);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function render(now) {
  ctx.clearRect(0, 0, width, height);
  let melting = false;
  let warming = false;
  for (const stroke of strokes) {
    const elapsed = now - stroke.finishedAt;
    if (stroke === currentStroke || elapsed < PHYSICS.meltDelayMs) warming = true;
    if (stroke !== currentStroke && elapsed >= PHYSICS.meltDelayMs) {
      const warmth = Math.min(1, (elapsed - PHYSICS.meltDelayMs) / 1100);
      drawMass(stroke, warmth);
      melting ||= elapsed < PHYSICS.meltDelayMs + PHYSICS.meltDurationMs;
    }
  }
  ctx.drawImage(pigment, 0, 0, width, height);
  for (const stroke of strokes) {
    if (stroke !== currentStroke) drawDrips(stroke, now - stroke.finishedAt);
  }
  if (currentStroke) {
    const { x, y } = pointToPixels(currentStroke.points.at(-1));
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#f6efdf';
    ctx.fill();
    ctx.strokeStyle = currentStroke.color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  const nextStatus = !strokes.length ? 'READY TO DRAW' : melting ? 'WAX IN MOTION' : warming ? 'WARMING UP' : 'MELTED';
  if (status.textContent !== nextStatus) status.textContent = nextStatus;
}

function tick(now) {
  frame = 0;
  render(now);
  if (strokes.some(stroke => stroke !== currentStroke && now - stroke.finishedAt >= PHYSICS.meltDelayMs && now - stroke.finishedAt < PHYSICS.meltDelayMs + PHYSICS.meltDurationMs)) {
    frame = requestAnimationFrame(tick);
  }
}

function scheduleMelt() {
  clearTimeout(wakeTimer);
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  const now = performance.now();
  const next = strokes
    .filter(stroke => stroke !== currentStroke && now - stroke.finishedAt < PHYSICS.meltDelayMs)
    .map(stroke => stroke.finishedAt + PHYSICS.meltDelayMs - now);
  const active = strokes.some(stroke => stroke !== currentStroke && now - stroke.finishedAt >= PHYSICS.meltDelayMs && now - stroke.finishedAt < PHYSICS.meltDelayMs + PHYSICS.meltDurationMs);
  if (active) frame = requestAnimationFrame(tick);
  else if (next.length) wakeTimer = setTimeout(() => { frame = requestAnimationFrame(tick); }, Math.max(0, Math.min(...next)));
}

function queueRender() {
  if (!frame) frame = requestAnimationFrame(tick);
}

function eraseSegment(a, b) {
  const start = pointToPixels(a);
  const end = pointToPixels(b);
  const radius = PHYSICS.eraserRadius;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const within = (x, y, reach) => {
    const t = lengthSquared ? Math.max(0, Math.min(1, ((x - start.x) * dx + (y - start.y) * dy) / lengthSquared)) : 0;
    return (x - start.x - t * dx) ** 2 + (y - start.y - t * dy) ** 2 <= reach ** 2;
  };

  pigmentCtx.save();
  pigmentCtx.globalCompositeOperation = 'destination-out';
  pigmentCtx.lineWidth = radius * 2;
  pigmentCtx.lineCap = 'round';
  pigmentCtx.beginPath();
  pigmentCtx.moveTo(start.x, start.y);
  pigmentCtx.lineTo(end.x, end.y);
  pigmentCtx.stroke();
  pigmentCtx.beginPath();
  pigmentCtx.arc(end.x, end.y, radius, 0, Math.PI * 2);
  pigmentCtx.fill();
  pigmentCtx.restore();

  const now = performance.now();
  for (const stroke of strokes) {
    for (const point of stroke.points) {
      if (point.erased) continue;
      const { x, y } = pointToPixels(point);
      if (within(x, y, radius)) {
        point.erased = true;
        stroke.visiblePoints--;
      }
    }
    for (const drip of stroke.drips) {
      if (drip.erased || drip.point.erased) continue;
      const seconds = Math.max(0, (now - stroke.finishedAt - PHYSICS.meltDelayMs - drip.delay) / 1000);
      const { x, y } = pointToPixels(drip.point);
      const length = Math.min(PHYSICS.maxDripLength * drip.length, .5 * PHYSICS.gravity * seconds * seconds, height - y - 15);
      for (let offset = 0; offset <= length; offset += 10) {
        const bend = drip.bend * Math.min(1, offset / 90);
        if (within(x + bend, y + offset, radius + drip.width / 2)) {
          drip.erased = true;
          break;
        }
      }
    }
  }
  const remaining = strokes.filter(stroke => stroke.visiblePoints > 0);
  if (remaining.length !== strokes.length) strokes = remaining;
}

function showEraser(event) {
  const bounds = canvas.getBoundingClientRect();
  eraserPreview.style.left = `${event.clientX - bounds.left}px`;
  eraserPreview.style.top = `${event.clientY - bounds.top}px`;
  eraserPreview.style.visibility = 'visible';
}

canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0 || activePointerId !== null) return;
  activePointerId = event.pointerId;
  canvas.setPointerCapture(event.pointerId);
  if (erasing) {
    lastErasePoint = unitPoint(event);
    eraseSegment(lastErasePoint, lastErasePoint);
    showEraser(event);
    queueRender();
    return;
  }
  currentStroke = {
    id: strokes.length + performance.now(), color: selectedColor,
    points: [], drips: [], visiblePoints: 0, travel: 0, lastDripAt: -PHYSICS.dripSpacing * .3,
    finishedAt: Infinity,
  };
  strokes.push(currentStroke);
  addPoint(currentStroke, unitPoint(event));
  queueRender();
});

canvas.addEventListener('pointermove', event => {
  if (activePointerId !== null && event.pointerId !== activePointerId) return;
  if (erasing) showEraser(event);
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
  if (lastErasePoint) {
    lastErasePoint = null;
    render(performance.now());
    return;
  }
  if (!currentStroke) return;
  currentStroke.finishedAt = performance.now();
  if (!currentStroke.drips.length) addDrip(currentStroke, currentStroke.points[0]);
  currentStroke = null;
  render(performance.now());
  scheduleMelt();
}
canvas.addEventListener('pointerup', finishStroke);
canvas.addEventListener('pointercancel', finishStroke);
canvas.addEventListener('lostpointercapture', finishStroke);
canvas.addEventListener('pointerleave', () => { eraserPreview.style.visibility = 'hidden'; });

colors.forEach(button => button.addEventListener('click', () => {
  selectedColor = button.dataset.color;
  erasing = false;
  eraserButton.classList.remove('selected');
  eraserButton.setAttribute('aria-pressed', 'false');
  eraserPreview.style.visibility = 'hidden';
  colors.forEach(color => {
    const active = color === button;
    color.classList.toggle('selected', active);
    color.setAttribute('aria-pressed', String(active));
  });
}));

eraserButton.addEventListener('click', () => {
  erasing = true;
  eraserButton.classList.add('selected');
  eraserButton.setAttribute('aria-pressed', 'true');
  colors.forEach(color => {
    color.classList.remove('selected');
    color.setAttribute('aria-pressed', 'false');
  });
});

clearButton.addEventListener('click', () => {
  clearTimeout(wakeTimer);
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  strokes = [];
  currentStroke = null;
  lastErasePoint = null;
  activePointerId = null;
  pigmentCtx.clearRect(0, 0, width, height);
  render(performance.now());
});

resize();
new ResizeObserver(resize).observe(canvas);
