import * as pdfjs from '../vendor/pdf.min.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('vendor/pdf.worker.min.mjs');

const LABELS = { bg: 'Background', fg: 'Text' };
const LOUPE_RADIUS = 10;
const LOUPE_SCALE = 6;
const THUMB_WIDTH = 88;
const SNAP_RADIUS = 3;
const CSS_PER_POINT = 96 / 72;
const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
const MAX_PIXELS = 16e6;

const shotKey = new URLSearchParams(location.search).get('shot');

const scroller = document.querySelector('.stage__scroll');
const inner = document.querySelector('.stage__inner');
const marker = document.querySelector('.stage__marker');
const loupeCanvas = document.querySelector('.loupe__canvas');
const loupeHex = document.querySelector('.loupe__hex');
const sourceNode = document.querySelector('.picker__source');
const statusNode = document.querySelector('.picker__status');
const sampleNode = document.querySelector('.sample');
const ratioNode = document.querySelector('.result__ratio');
const snapInput = document.querySelector('[data-option="snap"]');
const zoomInButton = document.querySelector('[data-action="zoom-in"]');
const zoomOutButton = document.querySelector('[data-action="zoom-out"]');
const zoomFitButton = document.querySelector('[data-action="zoom-fit"]');
const zoomLevel = document.querySelector('[data-zoom-level]');
const pageLabel = document.querySelector('[data-page-label]');
const thumbsButton = document.querySelector('[data-action="thumbs"]');
const thumbsNode = document.querySelector('.thumbs');
const thumbList = document.querySelector('.thumbs__list');
const viewNode = document.querySelector('.stage__view');
const searchForm = document.querySelector('.search');
const searchInput = document.querySelector('.search__input');
const searchCount = document.querySelector('.search__count');
const searchPrev = document.querySelector('[data-action="search-prev"]');
const searchNext = document.querySelector('[data-action="search-next"]');
const eyedropperButton = document.querySelector('[data-action="eyedropper"]');
const checkNodes = [...document.querySelectorAll('.check')];
const radios = [...document.querySelectorAll('.color__radio')];
const hexInputs = Object.fromEntries([...document.querySelectorAll('.color__hex')].map((node) => [node.dataset.role, node]));
const swatches = Object.fromEntries([...document.querySelectorAll('.color__swatch')].map((node) => [node.dataset.role, node]));

const loupeContext = loupeCanvas.getContext('2d');

const colors = { bg: null, fg: null };
const pages = [];
let target = 'bg';
let cursor = null;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toHex(rgb) {
  return `#${rgb.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function fromHex(text) {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text.trim());
  if (!match) return null;
  const digits = match[1].length === 3 ? [...match[1]].map((digit) => digit + digit).join('') : match[1];
  return [0, 2, 4].map((start) => parseInt(digits.slice(start, start + 2), 16));
}

function channel(value) {
  const scaled = value / 255;
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]) {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

function truncated(value) {
  return (Math.floor(value * 100) / 100).toFixed(2);
}

function say(message) {
  statusNode.textContent = message;
}

function contextOf(canvas) {
  return canvas.getContext('2d', { willReadFrequently: true });
}

function pixelAt(canvas, x, y) {
  const data = contextOf(canvas).getImageData(x, y, 1, 1).data;
  return [data[0], data[1], data[2]];
}

function strongestNear(canvas, x, y, against) {
  const left = clamp(x - SNAP_RADIUS, 0, canvas.width - 1);
  const top = clamp(y - SNAP_RADIUS, 0, canvas.height - 1);
  const width = clamp(x + SNAP_RADIUS, 0, canvas.width - 1) - left + 1;
  const height = clamp(y + SNAP_RADIUS, 0, canvas.height - 1) - top + 1;
  const data = contextOf(canvas).getImageData(left, top, width, height).data;
  let best = pixelAt(canvas, x, y);
  let bestRatio = contrast(best, against);
  for (let offset = 0; offset < data.length; offset += 4) {
    const candidate = [data[offset], data[offset + 1], data[offset + 2]];
    const candidateRatio = contrast(candidate, against);
    if (candidateRatio > bestRatio) {
      best = candidate;
      bestRatio = candidateRatio;
    }
  }
  return best;
}

function isReady(canvas) {
  return canvas.dataset.ready === 'true';
}

function drawLoupe() {
  if (!cursor) return;
  const size = (LOUPE_RADIUS * 2 + 1) * LOUPE_SCALE;
  loupeContext.imageSmoothingEnabled = false;
  loupeContext.clearRect(0, 0, size, size);
  loupeContext.drawImage(
    cursor.canvas,
    cursor.x - LOUPE_RADIUS,
    cursor.y - LOUPE_RADIUS,
    LOUPE_RADIUS * 2 + 1,
    LOUPE_RADIUS * 2 + 1,
    0,
    0,
    size,
    size
  );
  const cell = LOUPE_RADIUS * LOUPE_SCALE;
  loupeContext.lineWidth = 2;
  loupeContext.strokeStyle = '#000000';
  loupeContext.strokeRect(cell + 1, cell + 1, LOUPE_SCALE - 2, LOUPE_SCALE - 2);
  loupeContext.lineWidth = 1;
  loupeContext.strokeStyle = '#ffffff';
  loupeContext.strokeRect(cell + 0.5, cell + 0.5, LOUPE_SCALE - 1, LOUPE_SCALE - 1);
  loupeHex.textContent = `${toHex(pixelAt(cursor.canvas, cursor.x, cursor.y))} · p${pages.indexOf(cursor.canvas) + 1} ${cursor.x}, ${cursor.y}`;
}

function placeMarker() {
  if (!cursor) return;
  const { canvas, x, y } = cursor;
  const box = canvas.getBoundingClientRect();
  const frame = inner.getBoundingClientRect();
  marker.hidden = false;
  marker.style.left = `${box.left - frame.left + ((x + 0.5) / canvas.width) * box.width}px`;
  marker.style.top = `${box.top - frame.top + ((y + 0.5) / canvas.height) * box.height}px`;
}

function moveCursor(canvas, x, y) {
  let page = pages.indexOf(canvas);
  let row = y;
  while (row >= pages[page].height && page < pages.length - 1 && isReady(pages[page + 1])) {
    row -= pages[page].height;
    page += 1;
  }
  while (row < 0 && page > 0 && isReady(pages[page - 1])) {
    page -= 1;
    row += pages[page].height;
  }
  const next = pages[page];
  cursor = { canvas: next, x: clamp(x, 0, next.width - 1), y: clamp(row, 0, next.height - 1) };
  placeMarker();
  drawLoupe();
}

function reportText() {
  const value = contrast(colors.fg, colors.bg);
  const lines = checkNodes.map((node) => {
    const name = node.querySelector('.check__name').firstChild.textContent.trim();
    return `${name} (${node.dataset.min}:1): ${value >= Number(node.dataset.min) ? 'pass' : 'fail'}`;
  });
  return [`Text ${toHex(colors.fg)} on background ${toHex(colors.bg)} — ${truncated(value)}:1`, ...lines].join('\n');
}

function update(prefix = '') {
  const { fg, bg } = colors;
  const complete = Boolean(fg && bg);
  const value = complete ? contrast(fg, bg) : 0;

  ratioNode.textContent = complete ? `${truncated(value)}:1` : '—';
  if (complete) {
    sampleNode.style.setProperty('--sample-fg', toHex(fg));
    sampleNode.style.setProperty('--sample-bg', toHex(bg));
  } else {
    sampleNode.style.removeProperty('--sample-fg');
    sampleNode.style.removeProperty('--sample-bg');
  }

  checkNodes.forEach((node) => {
    const status = node.querySelector('.check__status');
    const passes = value >= Number(node.dataset.min);
    status.textContent = complete ? (passes ? 'Pass' : 'Fail') : '—';
    status.classList.toggle('check__status--pass', complete && passes);
    status.classList.toggle('check__status--fail', complete && !passes);
  });

  if (!complete) {
    say(prefix || 'Pick a background and a text colour.');
    return;
  }
  const normal = value >= 4.5 ? 'pass' : 'fail';
  say(`${prefix}Contrast ratio ${truncated(value)} to 1, normal text AA ${normal}.`);
}

function setColor(role, rgb, prefix) {
  colors[role] = rgb;
  swatches[role].style.setProperty('--swatch', toHex(rgb));
  hexInputs[role].value = toHex(rgb);
  hexInputs[role].removeAttribute('aria-invalid');
  update(prefix ?? `${LABELS[role]} ${toHex(rgb)}. `);
}

function selectTarget(role) {
  target = role;
  radios.forEach((radio) => {
    radio.checked = radio.value === role;
  });
}

function advance() {
  if (target === 'bg') selectTarget('fg');
}

function pick({ canvas, x, y }) {
  if (!isReady(canvas)) return;
  const snap = target === 'fg' && colors.bg && snapInput.checked;
  setColor(target, snap ? strongestNear(canvas, x, y, colors.bg) : pixelAt(canvas, x, y));
  advance();
}

function pointerToImage(event, canvas) {
  const box = canvas.getBoundingClientRect();
  return {
    x: Math.floor(((event.clientX - box.left) * canvas.width) / box.width),
    y: Math.floor(((event.clientY - box.top) * canvas.height) / box.height)
  };
}

function canvasFrom(event) {
  const canvas = event.target.closest?.('.stage__canvas');
  return canvas && isReady(canvas) ? canvas : null;
}

inner.addEventListener('pointermove', (event) => {
  const canvas = canvasFrom(event);
  if (!canvas) return;
  const point = pointerToImage(event, canvas);
  moveCursor(canvas, point.x, point.y);
});

inner.addEventListener('click', (event) => {
  const canvas = canvasFrom(event);
  if (!canvas) return;
  const point = pointerToImage(event, canvas);
  moveCursor(canvas, point.x, point.y);
  pick(cursor);
});

scroller.addEventListener('keydown', (event) => {
  if (!cursor) return;
  const step = event.shiftKey ? 10 : 1;
  const moves = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step]
  };

  if (moves[event.key]) {
    moveCursor(cursor.canvas, cursor.x + moves[event.key][0], cursor.y + moves[event.key][1]);
    marker.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  } else if (event.key === 'Enter' || event.key === ' ') {
    pick(cursor);
  } else {
    return;
  }
  event.preventDefault();
});

radios.forEach((radio) => {
  radio.addEventListener('change', () => selectTarget(radio.value));
});

Object.entries(hexInputs).forEach(([role, input]) => {
  input.addEventListener('change', () => {
    const rgb = fromHex(input.value);
    if (!rgb) {
      input.setAttribute('aria-invalid', 'true');
      say(`${LABELS[role]} colour is not a valid hex value.`);
      return;
    }
    setColor(role, rgb);
  });
});

const view = { current: -1, fit: true, scale: CSS_PER_POINT, entries: [], generation: 0, initialised: false, pendingCursor: null };

function fitScale() {
  const widest = Math.max(...view.entries.map((entry) => entry.size.width));
  return Math.max(0.1, scroller.clientWidth / widest);
}

async function renderEntry(entry, generation) {
  const { canvas, page } = entry;
  if (entry.task) {
    entry.task.cancel();
    await entry.task.promise.catch(() => {});
  }
  if (generation !== view.generation) return;

  let ratio = Math.max(1, window.devicePixelRatio || 1);
  const cssWidth = entry.size.width * view.scale;
  const cssHeight = entry.size.height * view.scale;
  while (cssWidth * cssHeight * ratio * ratio > MAX_PIXELS && ratio > 0.5) ratio -= 0.25;

  const viewport = page.getViewport({ scale: view.scale * ratio });
  canvas.dataset.ready = 'false';
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const task = page.render({ canvasContext: contextOf(canvas), viewport });
  entry.task = task;
  try {
    await task.promise;
  } catch (error) {
    if (error?.name === 'RenderingCancelledException') return;
    throw error;
  }
  if (generation !== view.generation) return;
  canvas.dataset.ready = 'true';
  const pending = view.pendingCursor;
  if (!view.initialised) {
    view.initialised = true;
    moveCursor(canvas, Math.floor(canvas.width / 2), Math.floor(canvas.height / 2));
  } else if (pending && view.entries[pending.index] === entry) {
    view.pendingCursor = null;
    if (!cursor) moveCursor(canvas, Math.floor(pending.fx * canvas.width), Math.floor(pending.fy * canvas.height));
  }
}

function syncZoomUi() {
  const percent = Math.round((view.scale / CSS_PER_POINT) * 100);
  zoomLevel.textContent = `${percent}%`;
  zoomFitButton.setAttribute('aria-pressed', String(view.fit));
  zoomOutButton.disabled = view.scale <= ZOOM_STEPS[0] * CSS_PER_POINT + 0.001;
  zoomInButton.disabled = view.scale >= ZOOM_STEPS[ZOOM_STEPS.length - 1] * CSS_PER_POINT - 0.001;
}

function layout() {
  if (!view.entries.length) return;
  if (view.fit) view.scale = fitScale();
  view.generation += 1;
  const generation = view.generation;
  const ratio = scroller.scrollHeight ? scroller.scrollTop / scroller.scrollHeight : 0;

  if (cursor) {
    const index = view.entries.findIndex((entry) => entry.canvas === cursor.canvas);
    if (index !== -1) view.pendingCursor = { index, fx: cursor.x / cursor.canvas.width, fy: cursor.y / cursor.canvas.height };
  }
  cursor = null;
  marker.hidden = true;
  view.entries.forEach((entry) => {
    const width = entry.size.width * view.scale;
    const height = entry.size.height * view.scale;
    entry.started = false;
    entry.canvas.dataset.ready = 'false';
    entry.canvas.style.width = `${width}px`;
    entry.canvas.style.aspectRatio = `${width} / ${height}`;
  });
  scroller.scrollTop = ratio * scroller.scrollHeight;
  syncZoomUi();

  view.observer?.disconnect();
  view.observer = new IntersectionObserver((changes) => {
    changes.forEach((change) => {
      if (!change.isIntersecting) return;
      const entry = view.entries.find((item) => item.canvas === change.target);
      if (!entry || entry.started) return;
      entry.started = true;
      renderEntry(entry, generation).catch(() => say('A page could not be rendered.'));
    });
  }, { root: scroller, rootMargin: '600px 0px' });
  view.entries.forEach((entry) => view.observer.observe(entry.canvas));
}

function zoomTo(scale) {
  view.fit = false;
  view.scale = scale;
  layout();
}

function stepZoom(direction) {
  const current = view.scale / CSS_PER_POINT;
  const next = direction > 0
    ? ZOOM_STEPS.find((step) => step > current + 0.001)
    : [...ZOOM_STEPS].reverse().find((step) => step < current - 0.001);
  if (next) zoomTo(next * CSS_PER_POINT);
}

zoomInButton.addEventListener('click', () => stepZoom(1));
zoomOutButton.addEventListener('click', () => stepZoom(-1));
zoomFitButton.addEventListener('click', () => {
  view.fit = true;
  layout();
});

scroller.addEventListener('wheel', (event) => {
  if (!event.ctrlKey || !view.entries.length) return;
  event.preventDefault();
  stepZoom(event.deltaY < 0 ? 1 : -1);
}, { passive: false });

function reveal(container, node, centre) {
  const box = node.getBoundingClientRect();
  const frame = container.getBoundingClientRect();
  container.scrollTo({
    top: container.scrollTop + box.top - frame.top - (centre ? (container.clientHeight - box.height) / 2 : 8),
    left: container.scrollLeft + box.left - frame.left - (container.clientWidth - box.width) / 2
  });
}

async function renderThumb(index) {
  const entry = view.entries[index];
  if (!entry) return;
  const ratio = Math.max(1, window.devicePixelRatio || 1);
  const viewport = entry.page.getViewport({ scale: (THUMB_WIDTH / entry.size.width) * ratio });
  entry.thumb.width = Math.floor(viewport.width);
  entry.thumb.height = Math.floor(viewport.height);
  await entry.page.render({ canvasContext: entry.thumb.getContext('2d'), viewport }).promise.catch(() => {});
}

function buildThumbs() {
  thumbList.replaceChildren();
  const observer = new IntersectionObserver((changes) => {
    changes.forEach((change) => {
      if (!change.isIntersecting) return;
      observer.unobserve(change.target);
      renderThumb(Number(change.target.dataset.index));
    });
  }, { root: thumbsNode, rootMargin: '300px' });

  view.entries.forEach((entry, index) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'thumb';
    button.dataset.index = String(index);
    button.setAttribute('aria-label', `Go to page ${index + 1}`);
    const canvas = document.createElement('canvas');
    canvas.className = 'thumb__canvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.aspectRatio = `${entry.size.width} / ${entry.size.height}`;
    const number = document.createElement('span');
    number.textContent = String(index + 1);
    button.append(canvas, number);
    item.append(button);
    thumbList.append(item);
    entry.thumb = canvas;
    observer.observe(button);
  });
}

thumbList.addEventListener('click', (event) => {
  const button = event.target.closest('.thumb');
  if (!button) return;
  reveal(scroller, view.entries[Number(button.dataset.index)].wrap, false);
});

thumbsButton.addEventListener('click', () => {
  const show = thumbsButton.getAttribute('aria-pressed') !== 'true';
  thumbsButton.setAttribute('aria-pressed', String(show));
  thumbsNode.hidden = !show;
  viewNode.classList.toggle('stage__view--plain', !show);
  if (view.entries.length) layout();
});

function updateCurrentPage() {
  if (!view.entries.length) return;
  const middle = scroller.getBoundingClientRect().top + scroller.clientHeight / 2;
  let current = 0;
  view.entries.forEach((entry, index) => {
    if (entry.wrap.getBoundingClientRect().top <= middle) current = index;
  });
  if (current === view.current) return;
  view.current = current;
  pageLabel.textContent = `${current + 1} / ${view.entries.length}`;
  [...thumbList.querySelectorAll('.thumb')].forEach((button, index) => {
    const active = index === current;
    button.classList.toggle('thumb--current', active);
    if (active) {
      button.setAttribute('aria-current', 'page');
      const from = thumbsNode.scrollTop;
      const to = from + thumbsNode.clientHeight;
      if (button.offsetTop < from || button.offsetTop + button.offsetHeight > to) thumbsNode.scrollTop = button.offsetTop - 8;
      const left = thumbsNode.scrollLeft;
      const right = left + thumbsNode.clientWidth;
      if (button.offsetLeft < left || button.offsetLeft + button.offsetWidth > right) thumbsNode.scrollLeft = button.offsetLeft - 8;
    } else {
      button.removeAttribute('aria-current');
    }
  });
}

let scrollFrame = 0;
scroller.addEventListener('scroll', () => {
  cancelAnimationFrame(scrollFrame);
  scrollFrame = requestAnimationFrame(updateCurrentPage);
});

const search = { token: 0, matches: [], current: -1, query: '' };

function foldChar(char) {
  const plain = char.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace('ς', 'σ');
  return plain || char.toLowerCase();
}

function normalise(text, compact) {
  let out = '';
  const map = [];
  let previousSpace = true;
  let index = 0;
  for (const char of text) {
    if (/\s/u.test(char)) {
      if (!compact && !previousSpace) {
        out += ' ';
        map.push(index);
        previousSpace = true;
      }
    } else {
      const plain = foldChar(char);
      out += plain;
      for (let step = 0; step < plain.length; step += 1) map.push(index);
      previousSpace = false;
    }
    index += char.length;
  }
  return { text: out, map };
}

async function textOf(entry) {
  if (entry.text) return entry.text;
  const content = await entry.page.getTextContent();
  const spans = [];
  let raw = '';
  content.items.forEach((item) => {
    if (!('str' in item)) return;
    spans.push({ item, start: raw.length });
    raw += item.str;
    if (item.hasEOL) raw += ' ';
  });
  entry.text = { raw, spans, views: {} };
  return entry.text;
}

function rectsFor(entry, from, to) {
  const viewport = entry.page.getViewport({ scale: 1 });
  const rects = [];
  entry.text.spans.forEach(({ item, start }) => {
    const length = item.str.length;
    if (!length || start + length <= from || start >= to) return;
    const begin = Math.max(from, start) - start;
    const end = Math.min(to, start + length) - start;
    const matrix = pdfjs.Util.transform(viewport.transform, item.transform);
    const height = Math.hypot(matrix[2], matrix[3]);
    rects.push({
      x: matrix[4] + (item.width * begin) / length,
      y: matrix[5] - height,
      width: (item.width * (end - begin)) / length,
      height
    });
  });
  return rects;
}

function addMark(entry, rect) {
  const mark = document.createElement('span');
  mark.className = 'stage__mark';
  mark.style.left = `${(rect.x / entry.size.width) * 100}%`;
  mark.style.top = `${(rect.y / entry.size.height) * 100}%`;
  mark.style.width = `${(rect.width / entry.size.width) * 100}%`;
  mark.style.height = `${(rect.height / entry.size.height) * 100}%`;
  entry.marks.append(mark);
  return mark;
}

function clearMarks() {
  view.entries.forEach((entry) => entry.marks.replaceChildren());
  search.matches = [];
  search.current = -1;
}

function showMatch(index) {
  if (!search.matches.length) return;
  search.matches[search.current]?.marks.forEach((mark) => mark.classList.remove('stage__mark--current'));
  search.current = (index + search.matches.length) % search.matches.length;
  const match = search.matches[search.current];
  match.marks.forEach((mark) => mark.classList.add('stage__mark--current'));
  reveal(scroller, match.marks[0], true);
  searchCount.textContent = `${search.current + 1} of ${search.matches.length}`;
}

async function findIn(entry, needle, compact, token) {
  const text = await textOf(entry);
  if (token !== search.token) return;
  text.views[compact] ||= normalise(text.raw, compact);
  const { text: haystack, map } = text.views[compact];
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + needle.length)) {
    const from = map[at];
    const to = map[at + needle.length - 1] + 1;
    const marks = rectsFor(entry, from, to).map((rect) => addMark(entry, rect));
    if (marks.length) search.matches.push({ marks });
  }
}

async function runSearch(query) {
  search.query = query;
  const token = search.token + 1;
  search.token = token;
  clearMarks();
  if (!query.trim()) {
    searchCount.textContent = '';
    return;
  }

  searchCount.textContent = 'Searching…';
  try {
    for (const compact of [false, true]) {
      const needle = normalise(query, compact).text.trim();
      if (!needle) continue;
      for (const entry of view.entries) {
        await findIn(entry, needle, compact, token);
        if (token !== search.token) return;
      }
      if (search.matches.length) break;
    }
  } catch (error) {
    searchCount.textContent = 'Search failed';
    return;
  }

  if (!search.matches.length) {
    const hasText = view.entries.some((entry) => entry.text?.raw.trim());
    searchCount.textContent = hasText ? 'No matches' : 'No text in this PDF';
    return;
  }
  showMatch(0);
}

async function stepMatch(direction) {
  clearTimeout(searchTimer);
  if (searchInput.value !== search.query) await runSearch(searchInput.value);
  else showMatch(search.current + direction);
}

let searchTimer = 0;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => runSearch(searchInput.value), 300);
});

searchInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || !event.shiftKey) return;
  event.preventDefault();
  stepMatch(-1);
});

searchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  clearTimeout(searchTimer);
  if (searchInput.value !== search.query) runSearch(searchInput.value);
  else stepMatch(1);
});

searchPrev.addEventListener('click', () => stepMatch(-1));
searchNext.addEventListener('click', () => stepMatch(1));

document.addEventListener('keydown', (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'f' || !view.entries.length) return;
  event.preventDefault();
  searchInput.focus();
  searchInput.select();
});

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => (view.fit ? layout() : placeMarker()), 150);
});

document.querySelector('[data-action="swap"]').addEventListener('click', () => {
  const { bg, fg } = colors;
  if (!bg && !fg) return;
  [colors.bg, colors.fg] = [fg, bg];
  ['bg', 'fg'].forEach((role) => {
    const value = colors[role];
    hexInputs[role].value = value ? toHex(value) : '';
    if (value) swatches[role].style.setProperty('--swatch', toHex(value));
    else swatches[role].style.removeProperty('--swatch');
  });
  update('Swapped. ');
});

document.querySelector('[data-action="copy"]').addEventListener('click', async () => {
  if (!colors.fg || !colors.bg) {
    say('Pick both colours before copying.');
    return;
  }
  try {
    await navigator.clipboard.writeText(reportText());
    say('Result copied.');
  } catch (error) {
    say('Copy failed.');
  }
});

if ('EyeDropper' in window) {
  eyedropperButton.hidden = false;
  eyedropperButton.addEventListener('click', async () => {
    try {
      const { sRGBHex } = await new EyeDropper().open();
      setColor(target, fromHex(sRGBHex));
      advance();
    } catch (error) {
      if (error?.name !== 'AbortError') say('Eyedropper failed.');
    }
  });
}

function addCanvas() {
  const wrap = document.createElement('div');
  wrap.className = 'stage__page';
  const canvas = document.createElement('canvas');
  canvas.className = 'stage__canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const marks = document.createElement('div');
  marks.className = 'stage__marks';
  marks.setAttribute('aria-hidden', 'true');
  wrap.append(canvas, marks);
  pages.push(canvas);
  inner.insertBefore(wrap, marker);
  return { wrap, canvas, marks };
}

async function showScreenshot(dataUrl) {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const { canvas } = addCanvas();
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.style.width = `${image.naturalWidth / Math.max(1, window.devicePixelRatio || 1)}px`;
  contextOf(canvas).drawImage(image, 0, 0);
  canvas.dataset.ready = 'true';
  moveCursor(canvas, Math.floor(canvas.width / 2), Math.floor(canvas.height / 2));
  [zoomInButton, zoomOutButton, zoomFitButton].forEach((node) => {
    node.disabled = true;
  });
  zoomLevel.textContent = '100%';
}

function clearView() {
  view.generation += 1;
  view.observer?.disconnect();
  view.entries.forEach((entry) => entry.task?.cancel());
  view.entries = [];
  view.current = -1;
  view.initialised = false;
  view.pendingCursor = null;
  pages.splice(0).forEach((canvas) => canvas.parentElement.remove());
  thumbList.replaceChildren();
  search.matches = [];
  search.current = -1;
  searchCount.textContent = '';
  pageLabel.textContent = '';
  cursor = null;
  marker.hidden = true;
}

function setControls(enabled) {
  [thumbsButton, searchInput, searchPrev, searchNext, zoomInButton, zoomOutButton, zoomFitButton].forEach((node) => {
    node.disabled = !enabled;
  });
  const showThumbs = enabled && thumbsButton.getAttribute('aria-pressed') === 'true';
  thumbsNode.hidden = !showThumbs;
  viewNode.classList.toggle('stage__view--plain', !showThumbs);
}

async function showPdf(url) {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  await renderPdf(new Uint8Array(await response.arrayBuffer()));
}

async function renderPdf(data) {
  clearView();
  setControls(true);
  const base = chrome.runtime.getURL('vendor/');
  const pdf = await pdfjs.getDocument({
    data,
    wasmUrl: `${base}wasm/`,
    cMapUrl: `${base}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${base}standard_fonts/`,
    iccUrl: `${base}iccs/`
  }).promise;

  for (let number = 1; number <= pdf.numPages; number += 1) {
    const page = await pdf.getPage(number);
    const size = page.getViewport({ scale: 1 });
    view.entries.push({
      ...addCanvas(),
      page,
      size: { width: size.width, height: size.height },
      started: false,
      task: null,
      text: null,
      thumb: null
    });
  }
  buildThumbs();
  layout();
  updateCurrentPage();
  say(`${pdf.numPages} page${pdf.numPages === 1 ? '' : 's'}. Scroll and click to pick.`);
}

const fileInput = document.querySelector('.picker__file');

document.querySelector('[data-action="open"]').addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  if (!file) return;
  say('Loading the PDF…');
  try {
    sourceNode.textContent = file.name;
    await renderPdf(new Uint8Array(await file.arrayBuffer()));
  } catch (error) {
    console.error('PDF load failed', error);
    say(`That file could not be opened (${error?.message || error}).`);
  }
  fileInput.value = '';
});

async function load() {
  const stored = shotKey ? (await chrome.storage.local.get(shotKey))[shotKey] : null;
  if (!stored) {
    say('This capture is no longer available. Open the PDF and run the extension again.');
    return;
  }

  sourceNode.textContent = stored.title || stored.url || '';
  say('Loading the PDF…');
  try {
    await showPdf(stored.url);
  } catch (error) {
    console.error('PDF load failed', error);
    clearView();
    setControls(false);
    await showScreenshot(stored.dataUrl);
    const blocked = stored.url?.startsWith('file:') && !(await chrome.extension.isAllowedFileSchemeAccess());
    say(blocked
      ? 'Local PDFs need "Allow access to file URLs" (chrome://extensions → FE Inspector → Details), or use "Open a PDF file" above to pick the file. Showing a screenshot of the visible area meanwhile.'
      : `The PDF could not be loaded (${error?.message || error}). Use "Open a PDF file" above to pick it, or see the screenshot of the visible area.`);
  }
}

load();
