const PHYSICS = {
  meltDelayMs: 2000,
  gravity: 58,          // pixels per second squared
  maxDripLength: 175,  // pixels
  meltDurationMs: 7800,
  dripSpacing: 34,      // pixels along a stroke
  waxWidth: 13,         // fresh crayon width in pixels
  massGain: 9,          // extra width when warm
};

const canvas = document.querySelector('#drawing');
const paper = document.querySelector('.paper-wrap');
const status = document.querySelector('#status');
const clearButton = document.querySelector('#clear');
const cursor = document.querySelector('#cursor');
const colors = [...document.querySelectorAll('.crayon')];
const ctx = canvas.getContext('2d');
const pigment = document.createElement('canvas');
const pigmentCtx = pigment.getContext('2d');

let selectedColor = colors[0].dataset.color;
let strokes = [];
let currentStroke = null;
let width = 0;
let height = 0;
let pixelRatio = 1;
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

function redrawPigment() {
  pigmentCtx.clearRect(0, 0, width, height);
  for (const stroke of strokes) {
    if (stroke.points.length === 1) stamp(stroke.points[0], stroke.color, 0);
    for (let i = 1; i < stroke.points.length; i++) {
      drawFreshSegment(stroke.points[i - 1], stroke.points[i], stroke.color, i);
    }
  }
}

function resize() {
  const bounds = canvas.getBoundingClientRect();
  width = bounds.width;
  height = bounds.height;
  pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = pigment.width = Math.round(width * pixelRatio);
  canvas.height = pigment.height = Math.round(height * pixelRatio);
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  pigmentCtx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  redrawPigment();
  render(performance.now());
}

function addDrip(stroke, point, distance) {
  const index = stroke.drips.length;
  const seed = stroke.id * 19 + index * 17;
  stroke.drips.push({
    point,
    delay: hash(seed + 2) * 1250,
    length: .45 + hash(seed + 3) * .65,
    width: 3.5 + hash(seed + 4) * 4.5,
    bend: (hash(seed + 5) - .5) * 17,
    distance,
  });
}

function addPoint(stroke, point) {
  const previous = stroke.points.at(-1);
  if (previous) {
    const distance = Math.hypot((point.x - previous.x) * width, (point.y - previous.y) * height);
    if (distance < 1.5) return;
    stroke.travel += distance;
    drawFreshSegment(previous, point, stroke.color, stroke.points.length);
    if (stroke.travel - stroke.lastDripAt >= PHYSICS.dripSpacing) {
      stroke.lastDripAt = stroke.travel;
      addDrip(stroke, point, stroke.travel);
    }
  } else {
    stamp(point, stroke.color, 0);
  }
  stroke.points.push(point);
  render(performance.now());
}

function drawMass(stroke, warmth) {
  if (stroke.points.length < 2) return;
  ctx.beginPath();
  stroke.points.forEach((point, index) => {
    const { x, y } = pointToPixels(point);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y + warmth * 2.3);
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
  status.textContent = !strokes.length ? 'READY TO DRAW' : melting ? 'WAX IN MOTION' : warming ? 'WARMING UP' : 'MELTED';
  paper.classList.toggle('melting', melting);
}

function tick(now) {
  frame = 0;
  render(now);
  if (strokes.some(stroke => stroke !== currentStroke && now - stroke.finishedAt < PHYSICS.meltDelayMs + PHYSICS.meltDurationMs)) {
    frame = requestAnimationFrame(tick);
  }
}

function scheduleMelt() {
  clearTimeout(wakeTimer);
  if (frame) cancelAnimationFrame(frame);
  const now = performance.now();
  const next = strokes
    .filter(stroke => stroke !== currentStroke && now - stroke.finishedAt < PHYSICS.meltDelayMs)
    .map(stroke => stroke.finishedAt + PHYSICS.meltDelayMs - now);
  const active = strokes.some(stroke => stroke !== currentStroke && now - stroke.finishedAt >= PHYSICS.meltDelayMs && now - stroke.finishedAt < PHYSICS.meltDelayMs + PHYSICS.meltDurationMs);
  if (active) frame = requestAnimationFrame(tick);
  else if (next.length) wakeTimer = setTimeout(() => { frame = requestAnimationFrame(tick); }, Math.max(0, Math.min(...next)));
}

function moveCursor(event) {
  if (event.pointerType === 'touch') return;
  const bounds = canvas.getBoundingClientRect();
  cursor.style.transform = `translate(${event.clientX - bounds.left}px, ${event.clientY - bounds.top}px)`;
  cursor.classList.add('visible');
}
canvas.addEventListener('pointerenter', moveCursor);
canvas.addEventListener('pointerleave', () => cursor.classList.remove('visible'));

canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  canvas.setPointerCapture(event.pointerId);
  cursor.classList.add('pressed');
  currentStroke = {
    id: strokes.length + performance.now(), color: selectedColor,
    points: [], drips: [], travel: 0, lastDripAt: -PHYSICS.dripSpacing * .3,
    finishedAt: Infinity,
  };
  strokes.push(currentStroke);
  addPoint(currentStroke, unitPoint(event));
});

canvas.addEventListener('pointermove', event => {
  moveCursor(event);
  if (!currentStroke) return;
  for (const sample of event.getCoalescedEvents?.() ?? [event]) addPoint(currentStroke, unitPoint(sample));
});

function finishStroke() {
  if (!currentStroke) return;
  cursor.classList.remove('pressed');
  currentStroke.finishedAt = performance.now();
  if (!currentStroke.drips.length) addDrip(currentStroke, currentStroke.points[0], 0);
  currentStroke = null;
  render(performance.now());
  scheduleMelt();
}
canvas.addEventListener('pointerup', finishStroke);
canvas.addEventListener('pointercancel', finishStroke);
canvas.addEventListener('lostpointercapture', finishStroke);

colors.forEach(button => button.addEventListener('click', () => {
  selectedColor = button.dataset.color;
  cursor.style.setProperty('--cursor-color', selectedColor);
  colors.forEach(color => {
    const active = color === button;
    color.classList.toggle('selected', active);
    color.setAttribute('aria-pressed', String(active));
  });
}));

clearButton.addEventListener('click', () => {
  clearTimeout(wakeTimer);
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  strokes = [];
  currentStroke = null;
  pigmentCtx.clearRect(0, 0, width, height);
  render(performance.now());
});

new ResizeObserver(resize).observe(canvas);
