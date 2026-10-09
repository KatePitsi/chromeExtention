(() => {
  const previous = window.__layoutRuler;
  if (previous?.alive?.()) return;
  try {
    previous?.deactivate?.();
  } catch (error) {
    /* the previous instance lost its extension context */
  }
  document.getElementById('layout-ruler-host')?.remove();
  document.getElementById('layout-ruler-design')?.remove();

  const Panel = globalThis.LayoutRulerPanel;
  const PIN_COLORS = ['#0ea5e9', '#7c3aed', '#059669', '#d97706', '#2563eb', '#db2777'];
  const SNAP = 6;
  const px = (value) => parseFloat(value) || 0;
  const r1 = (value) => Math.round(value * 10) / 10;
  const idle = (callback) => (window.requestIdleCallback ? requestIdleCallback(callback, { timeout: 600 }) : setTimeout(callback, 1));

  const TOGGLES = {
    layout: 'showLayout',
    'copy-on-click': 'copyOnClick',
    'focus-map': 'showFocusMap',
    headings: 'showHeadings',
    overflow: 'showOverflow',
    'layout-grid': 'showGrid',
    'grid-ruler': 'showGridRuler',
    design: 'showDesign',
    spacing: 'showSpacing',
    layers: 'showLayers',
    viewport: 'showViewport',
    'safe-areas': 'showSafeAreas',
    sections: 'showSections'
  };

  const DEFAULT_PRESETS = [
    { name: 'mobile', minWidth: 0, columns: 4, gutter: 16, margin: 16, maxWidth: null },
    { name: 'tablet', minWidth: 768, columns: 8, gutter: 24, margin: 32, maxWidth: null },
    { name: 'desktop', minWidth: 1024, columns: 12, gutter: 24, margin: 40, maxWidth: 1440 }
  ];

  const state = {
    active: false,
    claimed: false,
    hovered: null,
    locked: false,
    pins: [],
    showLayout: false,
    copyOnClick: false,
    showFocusMap: false,
    showHeadings: false,
    showOverflow: false,
    showGrid: false,
    showGridRuler: false,
    showDesign: false,
    showSpacing: false,
    showLayers: false,
    showViewport: false,
    showSafeAreas: false,
    showSections: false,
    viewportSize: { width: 375, height: 667 },
    spacingBase: 4,
    presets: DEFAULT_PRESETS.map((preset) => ({ ...preset })),
    design: { has: false, opacity: 50, x: 0, y: 0, scale: '1', scroll: true, blend: false },
    designDrag: false,
    ruler: { enabled: false, dragging: false, from: null, to: null, measures: [] },
    poppedOut: false
  };

  let host = null;
  let root = null;
  let panelBody = null;
  let toastNode = null;
  let captureNode = null;
  let designHost = null;
  let designCanvas = null;
  let designImage = null;
  const designMove = { active: false, startX: 0, startY: 0, x: 0, y: 0 };
  let rootBackground = null;
  let building = null;
  const drag = { active: false, offsetX: 0, offsetY: 0 };
  let toastTimer = 0;
  let rafId = 0;
  let lastSignature = '';
  let lastPush = 0;
  let pushTimer = 0;
  let pendingSnapshot = null;
  let saveTimer = 0;
  let gridTimer = 0;
  const layers = {};

  const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Dongle&family=Elms+Sans:ital,wght@0,100..900;1,100..900&family=Manrope:wght@200..800&display=swap';
  const FONT_STACK = `'Manrope', 'Elms Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif`;

  const STYLE = `
    :host {
      all: initial;
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      pointer-events: none;
      color-scheme: dark;
    }
    :host([hidden]) { display: none; }
    .layer {
      position: fixed;
      inset: 0;
      pointer-events: none;
      font: 500 14px/1.4 ${FONT_STACK};
      font-variant-numeric: tabular-nums;
      color: #e2e8f0;
    }
    .box {
      position: fixed;
      box-sizing: border-box;
    }
    .box--margin {
      background: rgba(251, 191, 36, .22);
      outline: 1px dashed rgba(161, 98, 7, .9);
    }
    .box--border { background: rgba(253, 230, 138, .35); }
    .box--padding { background: rgba(16, 185, 129, .22); }
    .box--content {
      background: rgba(237, 25, 65, .3);
      outline: 1px solid rgba(237, 25, 65, .95);
    }
    .chip {
      position: fixed;
      padding: 2px 8px;
      border-radius: 999px;
      background: rgba(11, 18, 32, .94);
      color: #f1f5f9;
      white-space: nowrap;
      box-shadow: 0 1px 3px rgba(2, 6, 23, .4);
    }
    .chip--track { background: rgba(217, 70, 239, .95); }
    .chip--warn { background: #b91c1c; color: #ffffff; }
    .chip--margin { background: #a16207; color: #ffffff; }
    .chip--padding { background: #047857; color: #ffffff; }
    .chip--viewport { background: #c8102e; color: #ffffff; }
    .fold {
      position: fixed;
      left: 0;
      right: 0;
      border-top: 2px dashed #f97316;
    }
    .fold__shade {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(15, 23, 42, .06);
    }
    .chip--fold { background: #c2410c; color: #ffffff; }
    .rhythm {
      position: fixed;
      box-sizing: border-box;
    }
    .rhythm--padding { background: rgba(16, 185, 129, .2); }
    .rhythm--gap {
      background: rgba(251, 191, 36, .3);
      border-top: 1px dashed #a16207;
      border-bottom: 1px dashed #a16207;
    }
    .chip--rhythm { background: #1e3a8a; color: #ffffff; }
    .tip {
      position: fixed;
      display: grid;
      gap: 2px;
      max-width: 360px;
      padding: 10px 12px;
      border-radius: 12px;
      background: rgba(11, 18, 32, .96);
      color: #cbd5e1;
      box-shadow: 0 12px 28px rgba(2, 6, 23, .45);
    }
    .tip__name { color: #f87a90; word-break: break-all; }
    .tip__size { color: #fcd34d; }
    .tip__facts {
      display: grid;
      grid-template-columns: max-content minmax(0, 1fr);
      gap: 2px 10px;
      margin: 4px 0 0;
    }
    .tip__key { color: #94a3b8; }
    .tip__value {
      margin: 0;
      color: #f8fafc;
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .tip__hint { color: #fcd34d; }
    .tip__issue { color: #fca5a5; }
    .rule {
      position: fixed;
      border-color: currentColor;
      border-style: dashed;
      border-width: 0;
    }
    .rule--h { border-top-width: 1px; }
    .rule--v { border-left-width: 1px; }
    .pin {
      position: fixed;
      box-sizing: border-box;
      background: currentColor;
      opacity: .14;
    }
    .pin__frame {
      position: fixed;
      box-sizing: border-box;
      border: 1px solid currentColor;
      border-radius: 2px;
    }
    .track {
      position: fixed;
      box-sizing: border-box;
      border: 1px dashed rgba(217, 70, 239, .75);
      background: rgba(217, 70, 239, .06);
    }
    .positioned {
      position: fixed;
      box-sizing: border-box;
      border: 1px dashed #38bdf8;
    }
    .chip--positioned {
      border: 0;
      background: rgba(3, 105, 161, .95);
      font: inherit;
      cursor: pointer;
      pointer-events: auto;
    }
    .layer {
      position: fixed;
      box-sizing: border-box;
      border: 2px solid #a78bfa;
    }
    .layer--block {
      border: 2px dotted #fbbf24;
    }
    .chip--layer {
      border: 0;
      background: rgba(91, 33, 182, .95);
      font: inherit;
      cursor: pointer;
      pointer-events: auto;
    }
    .chip--layer:focus-visible,
    .chip--positioned:focus-visible {
      outline: 2px solid #ffffff;
      outline-offset: 2px;
    }
    .track--gap {
      border-style: none;
      background: rgba(217, 70, 239, .22);
    }
    .track--item {
      border: 1px dashed rgba(16, 185, 129, .8);
      background: rgba(16, 185, 129, .05);
    }
    .gridcol {
      position: fixed;
      top: 0;
      bottom: 0;
      box-sizing: border-box;
      border-inline: 1px solid rgba(237, 25, 65, .35);
      background: rgba(237, 25, 65, .07);
    }
    .gridruler {
      position: fixed;
      inset: 0;
      background-image:
        linear-gradient(to right, rgba(0, 0, 0, .2) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(0, 0, 0, .2) 1px, transparent 1px);
      background-size: 37.8px 37.8px;
    }
    .capture {
      position: fixed;
      inset: 0;
      pointer-events: none;
    }
    .capture--armed {
      pointer-events: auto;
      cursor: crosshair;
    }
    .measure__line {
      position: fixed;
      height: 0;
      border-top: 1px solid #ed1941;
      transform-origin: 0 0;
    }
    .measure__leg {
      position: fixed;
      border-color: rgba(237, 25, 65, .6);
      border-style: dashed;
      border-width: 0;
    }
    .measure__leg--h { border-top-width: 1px; }
    .measure__leg--v { border-left-width: 1px; }
    .measure__dot {
      position: fixed;
      width: 7px;
      height: 7px;
      margin: -4px 0 0 -4px;
      border: 1px solid #ffffff;
      border-radius: 999px;
      background: #ed1941;
    }
    .chip--measure { background: #ed1941; color: #ffffff; }
    .focus__path {
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: visible;
      fill: none;
      stroke: rgba(245, 158, 11, .85);
      stroke-width: 1.5;
      stroke-dasharray: 4 3;
    }
    .focus__frame {
      position: fixed;
      box-sizing: border-box;
      border: 2px solid #f59e0b;
      border-radius: 3px;
    }
    .focus__frame--positive { border-color: #ed1941; }
    .focus__frame--small { border-style: dotted; }
    .badge {
      position: fixed;
      min-width: 22px;
      padding: 0 6px;
      border-radius: 999px;
      background: #f59e0b;
      color: #0b1220;
      font-weight: 700;
      text-align: center;
      white-space: nowrap;
      box-shadow: 0 0 0 2px #0b1220;
    }
    .badge--center { transform: translate(-50%, -50%); }
    .badge--positive { background: #c8102e; color: #ffffff; }
    .badge--heading { background: #0f766e; color: #ffffff; }
    .badge--landmark { background: #7e22ce; color: #ffffff; }
    .badge--overflow { background: #b91c1c; color: #ffffff; }
    .badge--clips { background: #b45309; color: #ffffff; }
    .outline__frame {
      position: fixed;
      box-sizing: border-box;
      border: 2px dashed #14b8a6;
    }
    .outline__frame--landmark { border: 2px solid #a855f7; }
    .overflow__frame {
      position: fixed;
      box-sizing: border-box;
      border: 2px dashed #ef4444;
    }
    .overflow__frame--clips { border: 2px dotted #f59e0b; }
    .toast {
      position: fixed;
      right: 16px;
      bottom: 16px;
      padding: 8px 14px;
      border-radius: 999px;
      background: #0b1220;
      color: #f1f5f9;
      font: 500 14px/1.4 ${FONT_STACK};
      box-shadow: 0 0 0 1px rgba(148, 163, 184, .14), 0 10px 24px rgba(2, 6, 23, .5);
      opacity: 0;
      transform: translateY(4px);
      transition: opacity .16s ease, transform .16s ease;
      pointer-events: none;
    }
    .toast--visible { opacity: 1; transform: translateY(0); }
    @media (prefers-reduced-motion: reduce) {
      .toast { transition: none; }
    }
  `;

  const DESIGN_STYLE = `
    :host {
      all: initial;
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      pointer-events: none;
    }
    :host([hidden]) { display: none; }
    canvas {
      position: absolute;
      left: 0;
      top: 0;
    }
    .design--draggable {
      pointer-events: auto;
      cursor: move;
      touch-action: none;
    }
  `;

  function el(tag, className, styles) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (styles) Object.assign(node.style, styles);
    return node;
  }

  function loadFonts() {
    if (document.getElementById('layout-ruler-fonts')) return;
    const links = [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      { rel: 'stylesheet', href: FONT_HREF, id: 'layout-ruler-fonts' }
    ];
    links.forEach((attributes) => {
      const link = document.createElement('link');
      Object.assign(link, attributes);
      document.head?.append(link);
    });
  }

  async function panelCss() {
    try {
      const response = await fetch(chrome.runtime.getURL('panel/panel.css'));
      return await response.text();
    } catch (error) {
      return '';
    }
  }

  async function build() {
    loadFonts();

    host = el('div');
    host.id = 'layout-ruler-host';
    root = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = STYLE;
    root.append(style);

    ['grid', 'pins', 'box', 'layout', 'distance', 'measure', 'focus', 'headings', 'overflow', 'labels'].forEach((name) => {
      layers[name] = el('div', 'layer');
      root.append(layers[name]);
    });

    captureNode = el('div', 'capture');
    captureNode.addEventListener('mousedown', onRulerDown);
    root.append(captureNode);

    panelBody = el('aside', 'panel panel--page panel--loading');
    panelBody.setAttribute('aria-label', 'FE Inspector');
    Panel.bind(panelBody, dispatchLocal);
    panelBody.addEventListener('mousedown', onPanelDown);
    root.append(panelBody);

    toastNode = el('output', 'toast');
    toastNode.setAttribute('aria-live', 'polite');
    root.append(toastNode);

    designHost = el('div');
    designHost.id = 'layout-ruler-design';
    const designRoot = designHost.attachShadow({ mode: 'open' });
    const designStyle = document.createElement('style');
    designStyle.textContent = DESIGN_STYLE;
    designCanvas = document.createElement('canvas');
    designCanvas.hidden = true;
    designCanvas.addEventListener('pointerdown', onDesignDown);
    designCanvas.addEventListener('pointermove', onDesignMove);
    designCanvas.addEventListener('pointerup', onDesignUp);
    designCanvas.addEventListener('pointercancel', onDesignUp);
    designRoot.append(designStyle, designCanvas);

    document.documentElement.append(designHost, host);

    style.textContent = STYLE + await panelCss();
    panelBody.classList.remove('panel--loading');
  }

  function topElementAt(x, y) {
    return document.elementsFromPoint(x, y)
      .find((node) => node !== host && node !== designHost && node !== document.documentElement) || null;
  }

  function isFrame(node) {
    return /^(IFRAME|FRAME)$/.test(node?.tagName || '');
  }

  /* ---------- settings ---------- */

  const settingsReady = chrome.storage.sync.get('settings')
    .then(({ settings }) => {
      if (settings?.spacingBase > 0) state.spacingBase = settings.spacingBase;
    })
    .catch(() => {});

  function currentToggles() {
    return Object.fromEntries(Object.values(TOGGLES).map((key) => [key, state[key]]));
  }

  function applyToggles(toggles) {
    Object.values(TOGGLES).forEach((key) => {
      state[key] = typeof toggles?.[key] === 'boolean' ? toggles[key] : false;
    });
  }

  async function loadToggles(fresh) {
    if (fresh) {
      applyToggles(null);
      send({ type: 'layout-ruler/toggles', toggles: currentToggles() });
      return;
    }
    const response = await chrome.runtime.sendMessage({ type: 'layout-ruler/toggles-get' }).catch(() => null);
    applyToggles(response?.toggles);
  }

  function saveSettings() {
    send({ type: 'layout-ruler/toggles', toggles: currentToggles() });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      chrome.storage.sync.set({ settings: { spacingBase: state.spacingBase } }).catch(() => {});
    }, 500);
  }

  const gridKey = () => `grid:${location.origin}`;

  async function loadPresets() {
    try {
      const stored = await chrome.storage.local.get(gridKey());
      const presets = stored[gridKey()];
      state.presets = Array.isArray(presets) && presets.length ? presets : DEFAULT_PRESETS.map((preset) => ({ ...preset }));
    } catch (error) {
      /* keep defaults */
    }
  }

  function savePresets() {
    clearTimeout(gridTimer);
    gridTimer = setTimeout(() => chrome.storage.local.set({ [gridKey()]: state.presets }).catch(() => {}), 400);
  }

  /* ---------- ruler ---------- */

  const toPage = (point) => ({ x: point.x + scrollX, y: point.y + scrollY });
  const toView = (point) => ({ x: point.x - scrollX, y: point.y - scrollY });

  function snapPoint(x, y, origin, constrain) {
    let point = { x, y };
    if (constrain) {
      if (Math.abs(x - origin.x) >= Math.abs(y - origin.y)) point = { x, y: origin.y };
      else point = { x: origin.x, y };
    }
    const target = topElementAt(x, y);
    if (!target) return point;
    const rect = target.getBoundingClientRect();
    const near = (value, edge) => Math.abs(value - edge) <= SNAP;
    [rect.left, rect.right].forEach((edge) => { if (near(point.x, edge)) point.x = edge; });
    [rect.top, rect.bottom].forEach((edge) => { if (near(point.y, edge)) point.y = edge; });
    return point;
  }

  function setRulerEnabled(enabled) {
    state.ruler.enabled = enabled;
    if (!enabled) {
      state.ruler.dragging = false;
      state.ruler.from = null;
      state.ruler.to = null;
    }
    captureNode?.classList.toggle('capture--armed', enabled);
    invalidate();
  }

  function onRulerDown(event) {
    if (!state.ruler.enabled || event.button !== 0) return;
    event.preventDefault();
    const start = toPage(snapPoint(event.clientX, event.clientY, { x: event.clientX, y: event.clientY }, false));
    state.ruler.from = start;
    state.ruler.to = start;
    state.ruler.dragging = true;
    invalidate();
  }

  function onRulerMove(event) {
    if (!state.ruler.dragging) return;
    state.ruler.to = toPage(snapPoint(event.clientX, event.clientY, toView(state.ruler.from), event.shiftKey));
    invalidate();
  }

  function onRulerUp() {
    if (!state.ruler.dragging) return;
    const { from, to } = state.ruler;
    if (Math.hypot(to.x - from.x, to.y - from.y) >= 1) state.ruler.measures.push({ from, to });
    state.ruler.dragging = false;
    state.ruler.from = null;
    state.ruler.to = null;
    invalidate();
  }

  const pxLabel = (value) => `${r1(Math.abs(value))}px`;

  function measureMetrics({ from, to }, index) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    return { from: toView(from), to: toView(to), dx, dy, length: Math.hypot(dx, dy), index };
  }

  function measurements() {
    const { measures, from, to } = state.ruler;
    const list = measures.map((measure, index) => measureMetrics(measure, index + 1));
    if (from && to) list.push(measureMetrics({ from, to }, list.length + 1));
    return list;
  }

  function measureFacts(measure) {
    return [['dx', pxLabel(measure.dx)], ['dy', pxLabel(measure.dy)], ['length', pxLabel(measure.length)]];
  }

  function clearMeasures() {
    state.ruler.measures = [];
    state.ruler.from = null;
    state.ruler.to = null;
    invalidate();
  }

  function drawRuler() {
    measurements().forEach(drawMeasure);
  }

  function drawMeasure(measure) {
    const { from, to, dx, dy, length, index } = measure;

    if (Math.abs(dx) >= 0.5 && Math.abs(dy) >= 0.5) {
      const legX = el('div', 'measure__leg measure__leg--h', {
        left: `${Math.min(from.x, to.x)}px`,
        top: `${from.y}px`,
        width: `${Math.abs(dx)}px`
      });
      const legY = el('div', 'measure__leg measure__leg--v', {
        left: `${to.x}px`,
        top: `${Math.min(from.y, to.y)}px`,
        height: `${Math.abs(dy)}px`
      });
      layers.measure.append(legX, legY);
      chip(pxLabel(dx), (from.x + to.x) / 2, from.y - 12, '', { transform: 'translate(-50%, -50%)' });
      chip(pxLabel(dy), to.x + 12, (from.y + to.y) / 2, '', { transform: 'translate(-50%, -50%)' });
    }

    const line = el('div', 'measure__line', {
      left: `${from.x}px`,
      top: `${from.y}px`,
      width: `${length}px`,
      transform: `rotate(${Math.atan2(dy, dx)}rad)`
    });
    const start = el('div', 'measure__dot', { left: `${from.x}px`, top: `${from.y}px` });
    const end = el('div', 'measure__dot', { left: `${to.x}px`, top: `${to.y}px` });
    layers.measure.append(line, start, end);

    chip(`${index} · ${pxLabel(length)}`, (from.x + to.x) / 2, (from.y + to.y) / 2 - 14, 'measure', { transform: 'translate(-50%, -50%)' });
  }

  function clear(layer) {
    while (layer.firstChild) layer.firstChild.remove();
  }

  /* ---------- accessibility ---------- */

  const INTERACTIVE_ROLES = new Set(['button', 'link', 'checkbox', 'radio', 'switch', 'textbox', 'searchbox', 'combobox', 'listbox', 'slider', 'spinbutton', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'treeitem']);
  const NAME_FROM_CONTENT = new Set(['button', 'cell', 'checkbox', 'columnheader', 'gridcell', 'heading', 'link', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'radio', 'row', 'rowheader', 'switch', 'tab', 'tooltip', 'treeitem', 'summary']);
  const LANDMARK_ROLES = new Set(['banner', 'navigation', 'main', 'complementary', 'contentinfo', 'region', 'form', 'search']);
  const SECTIONING = 'article, aside, main, nav, section, [role="article"], [role="complementary"], [role="main"], [role="navigation"], [role="region"]';
  const normalise = (text) => (text || '').replace(/\s+/g, ' ').trim();

  function inputRole(node) {
    const type = (node.getAttribute('type') || 'text').toLowerCase();
    if (/^(button|submit|reset|image)$/.test(type)) return 'button';
    if (type === 'checkbox') return node.getAttribute('switch') !== null ? 'switch' : 'checkbox';
    if (type === 'radio') return 'radio';
    if (type === 'range') return 'slider';
    if (type === 'number') return 'spinbutton';
    if (type === 'hidden') return 'none';
    if (node.hasAttribute('list')) return 'combobox';
    if (type === 'search') return 'searchbox';
    if (/^(text|email|tel|url|password)$/.test(type)) return 'textbox';
    return type;
  }

  function implicitRole(node) {
    const tag = node.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) return 'heading';
    switch (tag) {
      case 'a':
      case 'area':
        return node.hasAttribute('href') ? 'link' : 'generic';
      case 'button': return 'button';
      case 'input': return inputRole(node);
      case 'select': return node.multiple || node.size > 1 ? 'listbox' : 'combobox';
      case 'textarea': return 'textbox';
      case 'img': return node.getAttribute('alt') === '' ? 'presentation' : 'img';
      case 'nav': return 'navigation';
      case 'main': return 'main';
      case 'search': return 'search';
      case 'aside': return node.parentElement?.closest(SECTIONING) && !hasOwnLabel(node) ? 'generic' : 'complementary';
      case 'header': return node.parentElement?.closest(SECTIONING) ? 'generic' : 'banner';
      case 'footer': return node.parentElement?.closest(SECTIONING) ? 'generic' : 'contentinfo';
      case 'section': return hasOwnLabel(node) ? 'region' : 'generic';
      case 'form': return hasOwnLabel(node) ? 'form' : 'generic';
      case 'ul':
      case 'ol':
      case 'menu':
        return 'list';
      case 'li': return 'listitem';
      case 'table': return 'table';
      case 'tr': return 'row';
      case 'td': return 'cell';
      case 'th': return node.closest('thead') || node.getAttribute('scope') === 'col' ? 'columnheader' : 'rowheader';
      case 'dialog': return 'dialog';
      case 'details': return 'group';
      case 'summary': return 'summary';
      case 'fieldset': return 'group';
      case 'figure': return 'figure';
      case 'p': return 'paragraph';
      case 'hr': return 'separator';
      case 'progress': return 'progressbar';
      case 'meter': return 'meter';
      case 'output': return 'status';
      case 'option': return 'option';
      case 'iframe': return 'iframe';
      case 'svg': return 'graphics-document';
      default: return 'generic';
    }
  }

  function hasOwnLabel(node) {
    return Boolean(normalise(node.getAttribute('aria-label')) || referencedText(node, 'aria-labelledby') || normalise(node.getAttribute('title')));
  }

  function roleOf(node) {
    const explicit = node.getAttribute('role')?.trim().split(/\s+/)[0];
    return explicit || implicitRole(node);
  }

  function hiddenFromAT(node) {
    if (node.closest('[aria-hidden="true"]')) return true;
    return node.checkVisibility ? !node.checkVisibility({ visibilityProperty: true }) : false;
  }

  function pseudoText(node, which) {
    const content = getComputedStyle(node, which).content;
    if (!content || content === 'none' || content === 'normal') return '';
    const match = content.match(/^"(.*)"$/);
    return match ? match[1] : '';
  }

  function contentText(node, budget = { elements: 400 }, skip = null) {
    let text = pseudoText(node, '::before');
    node.childNodes.forEach((child) => {
      if (child.nodeType === 3) {
        text += child.nodeValue;
        return;
      }
      if (child.nodeType !== 1 || child === host || child === skip || budget.elements <= 0) return;
      budget.elements -= 1;
      if (hiddenFromAT(child)) return;
      const label = normalise(child.getAttribute('aria-label'));
      let part;
      if (label) part = label;
      else if (child.tagName === 'IMG' || (child.tagName === 'INPUT' && child.type === 'image')) part = child.getAttribute('alt') || '';
      else if (/^(INPUT|TEXTAREA)$/.test(child.tagName)) part = child.value || '';
      else if (child.tagName === 'SELECT') part = child.selectedOptions?.[0]?.textContent || '';
      else part = contentText(child, budget, skip);
      const block = !/^inline/.test(getComputedStyle(child).display);
      text += block ? ` ${part} ` : part;
    });
    return normalise(text + pseudoText(node, '::after'));
  }

  function visuallyHidden(node) {
    const rect = node.getBoundingClientRect();
    return rect.width <= 1 && rect.height <= 1;
  }

  const ICON_GLYPHS = /[\uE000-\uF8FF]/g;
  const NON_TEXT = /^(IMG|PICTURE|VIDEO|CANVAS|svg|SVG)$/;

  function visibleText(node, budget = { elements: 400 }, skip = null) {
    let text = pseudoText(node, '::before');
    node.childNodes.forEach((child) => {
      if (child.nodeType === 3) {
        text += child.nodeValue;
        return;
      }
      if (child.nodeType !== 1 || child === host || child === skip || budget.elements <= 0) return;
      budget.elements -= 1;
      if (NON_TEXT.test(child.tagName) || hiddenFromAT(child) || visuallyHidden(child)) return;
      let part;
      if (child.tagName === 'INPUT' && /^(button|submit|reset)$/.test(child.type)) part = child.value || '';
      else if (/^(INPUT|TEXTAREA|SELECT)$/.test(child.tagName)) part = '';
      else part = visibleText(child, budget, skip);
      const block = !/^inline/.test(getComputedStyle(child).display);
      text += block ? ` ${part} ` : part;
    });
    return normalise((text + pseudoText(node, '::after')).replace(ICON_GLYPHS, ''));
  }

  function referencedText(node, attribute) {
    const ids = node.getAttribute(attribute)?.trim().split(/\s+/).filter(Boolean) || [];
    return normalise(ids.map((id) => {
      const target = document.getElementById(id);
      if (!target) return '';
      const label = normalise(target.getAttribute('aria-label'));
      if (label) return label;
      if (target.tagName === 'IMG') return normalise(target.getAttribute('alt'));
      if (/^(INPUT|TEXTAREA)$/.test(target.tagName)) return normalise(target.value);
      return contentText(target) || (hiddenFromAT(target) ? normalise(target.textContent) : '');
    }).join(' '));
  }

  function nativeName(node, role) {
    const tag = node.tagName;
    if (tag === 'INPUT') {
      const type = (node.type || 'text').toLowerCase();
      if (/^(button|submit|reset)$/.test(type)) {
        return { name: node.value || (type === 'submit' ? 'Submit' : type === 'reset' ? 'Reset' : ''), source: 'value' };
      }
      if (type === 'image') return { name: node.getAttribute('alt') || '', source: 'alt' };
    }
    if (/^(INPUT|SELECT|TEXTAREA|METER|PROGRESS|OUTPUT)$/.test(tag) && node.labels?.length) {
      return { name: normalise([...node.labels].map((label) => contentText(label, undefined, node)).join(' ')), source: 'label' };
    }
    if ((tag === 'IMG' || tag === 'AREA') && node.hasAttribute('alt')) return { name: normalise(node.getAttribute('alt')), source: 'alt' };
    if (tag === 'FIELDSET') {
      const legend = node.querySelector(':scope > legend');
      if (legend) return { name: contentText(legend), source: 'legend' };
    }
    if (tag === 'FIGURE') {
      const caption = node.querySelector(':scope > figcaption');
      if (caption) return { name: contentText(caption), source: 'figcaption' };
    }
    if (tag === 'TABLE' && node.caption) return { name: contentText(node.caption), source: 'caption' };
    if (tag.toLowerCase() === 'svg') {
      const title = node.querySelector(':scope > title');
      if (title) return { name: normalise(title.textContent), source: '<title>' };
    }
    if (role === 'summary' || NAME_FROM_CONTENT.has(role)) return { name: contentText(node), source: 'content' };
    return { name: '', source: 'none' };
  }

  function accessibleName(node) {
    const role = roleOf(node);
    const labelledBy = referencedText(node, 'aria-labelledby');
    if (labelledBy) return { name: labelledBy, source: 'aria-labelledby' };
    const label = normalise(node.getAttribute('aria-label'));
    if (label) return { name: label, source: 'aria-label' };
    const native = nativeName(node, role);
    if (native.name) return native;
    const title = normalise(node.getAttribute('title'));
    if (title) return { name: title, source: 'title' };
    const placeholder = normalise(node.getAttribute('placeholder'));
    if (placeholder) return { name: placeholder, source: 'placeholder' };
    return { name: '', source: 'none' };
  }

  function headingLevel(node) {
    const level = Number(node.getAttribute('aria-level'));
    if (level > 0) return level;
    const match = node.tagName.match(/^H([1-6])$/);
    return match ? Number(match[1]) : 2;
  }

  function isFocusable(node) {
    if (/^(A|AREA)$/.test(node.tagName) && !node.hasAttribute('href') && !node.hasAttribute('tabindex')) return false;
    return node.tabIndex >= 0 && !node.matches(':disabled') && !node.closest('[inert]');
  }

  const LABEL_IN_NAME_ROLES = new Set(['button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'treeitem', 'summary', 'textbox', 'searchbox', 'combobox', 'listbox', 'slider', 'spinbutton']);

  function comparable(text) {
    return normalise(text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' '));
  }

  function visibleLabel(node) {
    if (node.tagName === 'INPUT' && /^(button|submit|reset)$/.test(node.type)) return normalise(node.value);
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(node.tagName)) {
      return normalise([...(node.labels || [])].map((label) => visibleText(label, undefined, node)).join(' '));
    }
    return visibleText(node);
  }

  function labelInNameFlag(node, role, name, source) {
    if (!LABEL_IN_NAME_ROLES.has(role) || !/^aria-label/.test(source)) return null;
    const visible = visibleLabel(node);
    const wanted = comparable(visible);
    if (!wanted || ` ${comparable(name)} `.includes(` ${wanted} `)) return null;
    return `Accessible name “${name}” (${source}) does not contain the visible label “${visible}” (2.5.3 Label in Name).`;
  }

  function statesOf(node) {
    const states = [];
    ['expanded', 'pressed', 'checked', 'selected', 'current', 'invalid', 'haspopup'].forEach((name) => {
      const value = node.getAttribute(`aria-${name}`);
      if (value !== null) states.push(`${name}=${value}`);
    });
    if (node.matches('input[type="checkbox"], input[type="radio"]') && !node.hasAttribute('aria-checked')) states.push(`checked=${node.checked}`);
    if (node.matches(':disabled') || node.getAttribute('aria-disabled') === 'true') states.push('disabled');
    if (node.required || node.getAttribute('aria-required') === 'true') states.push('required');
    if (node.closest('[aria-hidden="true"]')) states.push('aria-hidden');
    if (node.hasAttribute('tabindex')) states.push(`tabindex=${node.getAttribute('tabindex')}`);
    if (isFocusable(node)) states.push('focusable');
    return states;
  }

  function accessibility(node) {
    const role = roleOf(node);
    const { name, source } = accessibleName(node);
    const description = referencedText(node, 'aria-describedby') || (source !== 'title' ? normalise(node.getAttribute('title')) : '');
    const rect = node.getBoundingClientRect();
    const interactive = INTERACTIVE_ROLES.has(role) || (isFocusable(node) && node !== document.body && node !== document.documentElement);
    const inline = /^inline/.test(getComputedStyle(node).display) && role === 'link';
    const facts = [
      ['role', role === 'heading' ? `heading level ${headingLevel(node)}` : role],
      ['name', name ? `“${name}”` : '(none)'],
      ['name from', source]
    ];
    if (description) facts.push(['description', `“${description}”`]);
    const states = statesOf(node);
    if (states.length) facts.push(['states', states.join(', ')]);
    const contrast = contrastFacts(node);
    facts.push(...contrast);

    const flags = [];
    if (interactive) {
      const small = rect.width < 24 || rect.height < 24;
      const status = small
        ? (inline ? 'under 24×24, inline link exception applies' : 'under 24×24 (2.5.8)')
        : rect.width < 44 || rect.height < 44 ? 'meets 24×24, under 44×44 (AAA 2.5.5)' : 'meets 44×44';
      facts.push(['target', `${r1(rect.width)} × ${r1(rect.height)} · ${status}`]);
      if (small && !inline) flags.push(`Target ${r1(rect.width)}×${r1(rect.height)} is under 24×24 (2.5.8). Check the spacing exception.`);
      if (!name) flags.push('Interactive element with no accessible name.');
    }
    const labelFlag = labelInNameFlag(node, role, name, source);
    if (labelFlag) flags.push(labelFlag);
    if (node.closest('[aria-hidden="true"]') && (isFocusable(node) || [...node.querySelectorAll(FOCUSABLE)].some(isFocusable))) {
      flags.push('aria-hidden on a focusable element, or one containing focusable elements.');
    }
    if (node.tabIndex > 0) flags.push(`tabindex=${node.tabIndex} changes the focus order.`);
    if (node.tagName === 'IMG' && !node.hasAttribute('alt')) flags.push('img has no alt attribute.');
    if (role === 'heading' && !name) flags.push('Empty heading.');
    const ratio = contrast.find(([key]) => key === 'contrast')?.[1] || '';
    if (/AA fail/.test(ratio)) flags.push(`Text contrast ${ratio.split(' · ')[0]} fails AA (1.4.3).`);
    return { facts, flags, role, name };
  }

  /* ---------- maps: focus order, headings & landmarks, overflow ---------- */

  const FOCUSABLE = 'a[href], area[href], button, input:not([type="hidden"]), select, textarea, iframe, summary, audio[controls], video[controls], [contenteditable]:not([contenteditable="false"]), [tabindex]';

  function inRadioTabOrder(node) {
    if (node.type !== 'radio' || !node.name) return true;
    const group = [...(node.form || document).querySelectorAll('input[type="radio"]')]
      .filter((radio) => radio.name === node.name && radio.form === node.form && !radio.disabled && radio.checkVisibility({ visibilityProperty: true }));
    const checked = group.find((radio) => radio.checked);
    return checked ? checked === node : group[0] === node;
  }

  function isTabStop(node, modal) {
    if (!isFocusable(node)) return false;
    if (host?.contains(node) || (modal && !modal.contains(node))) return false;
    const rect = node.getBoundingClientRect();
    if (!rect.width && !rect.height) return false;
    if (node.checkVisibility && !node.checkVisibility({ visibilityProperty: true })) return false;
    return inRadioTabOrder(node);
  }

  function focusStops() {
    const modal = [...document.querySelectorAll('dialog:modal')].pop() || null;
    const nodes = [...document.querySelectorAll(FOCUSABLE)].filter((node) => isTabStop(node, modal));
    const positive = nodes.filter((node) => node.tabIndex > 0).sort((a, b) => a.tabIndex - b.tabIndex);
    return positive.concat(nodes.filter((node) => node.tabIndex === 0)).slice(0, 1000);
  }

  function onScreen(rect) {
    return rect.bottom >= 0 && rect.right >= 0 && rect.top <= innerHeight && rect.left <= innerWidth;
  }

  function isSmallTarget(rect) {
    return rect.width < 24 || rect.height < 24;
  }

  function place(node, box) {
    Object.assign(node.style, {
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${Math.max(box.width, 0)}px`,
      height: `${Math.max(box.height, 0)}px`
    });
  }

  function badge(layer, text, x, y, modifier, centred) {
    const node = el('span', `badge${modifier ? ` badge--${modifier}` : ''}${centred ? ' badge--center' : ''}`, {
      left: `${x}px`,
      top: `${y}px`
    });
    node.textContent = text;
    layer.append(node);
    return node;
  }

  function drawFocusMap(items, layer) {
    const rects = items.map(({ node }) => node.getBoundingClientRect());
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'focus__path');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    path.setAttribute('points', rects.map((rect) => `${rect.left + rect.width / 2},${rect.top + rect.height / 2}`).join(' '));
    svg.append(path);
    layer.append(svg);

    items.forEach(({ node }, index) => {
      const rect = rects[index];
      if (!onScreen(rect)) return;
      const positive = node.tabIndex > 0;
      const frame = el('div', `focus__frame${positive ? ' focus__frame--positive' : ''}${isSmallTarget(rect) ? ' focus__frame--small' : ''}`);
      place(frame, rect);
      layer.append(frame);
      badge(layer, String(index + 1), Math.max(rect.left, 12), Math.max(rect.top, 12), positive ? 'positive' : '', true);
    });
  }

  function scanOutline() {
    const headings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]')]
      .filter((node) => !hiddenFromAT(node) && roleOf(node) === 'heading')
      .slice(0, 400)
      .map((node) => ({ node, kind: 'heading', level: headingLevel(node), text: accessibleName(node).name }));
    const landmarks = [...document.querySelectorAll('header, footer, nav, main, aside, section, form, search, [role]')]
      .filter((node) => LANDMARK_ROLES.has(roleOf(node)) && !hiddenFromAT(node))
      .slice(0, 200)
      .map((node) => ({ node, kind: 'landmark', role: roleOf(node), name: accessibleName(node).name }));
    return headings.concat(landmarks);
  }

  function describeOutline(items) {
    return items.map((item) => (item.kind === 'heading' ? `h${item.level}:${item.text}` : `${item.role}:${item.name}`)).join('|');
  }

  function outlineWarnings(items) {
    const headings = items.filter((item) => item.kind === 'heading');
    const landmarks = items.filter((item) => item.kind === 'landmark');
    const warnings = [];
    const h1 = headings.filter((item) => item.level === 1).length;
    if (!h1) warnings.push('No level-1 heading on the page.');
    if (h1 > 1) warnings.push(`${h1} level-1 headings.`);
    const skips = [];
    headings.forEach((item, index) => {
      const before = headings[index - 1];
      if (before && item.level > before.level + 1) skips.push(`H${before.level} → H${item.level} skips a level (“${item.text || '(empty)'}”).`);
    });
    warnings.push(...skips.slice(0, 5));
    if (skips.length > 5) warnings.push(`+${skips.length - 5} more skipped levels.`);
    const empty = headings.filter((item) => !item.text).length;
    if (empty) warnings.push(`${empty} empty heading${empty > 1 ? 's' : ''}.`);
    const byRole = {};
    landmarks.forEach((item) => { (byRole[item.role] ||= []).push(item); });
    Object.entries(byRole).forEach(([role, list]) => {
      if (role === 'main' && list.length > 1) warnings.push(`${list.length} main landmarks.`);
      if (list.length > 1 && role !== 'region' && role !== 'form') {
        const names = list.map((item) => item.name.toLowerCase());
        if (names.some((name) => !name) || new Set(names).size < names.length) {
          warnings.push(`${list.length} ${role} landmarks without unique names.`);
        }
      }
    });
    if (!byRole.main) warnings.push('No main landmark.');
    return warnings;
  }

  function drawOutline(items, layer) {
    items.forEach((item) => {
      const rect = item.node.getBoundingClientRect();
      if (!onScreen(rect) || (!rect.width && !rect.height)) return;
      const frame = el('div', `outline__frame${item.kind === 'landmark' ? ' outline__frame--landmark' : ''}`);
      place(frame, rect);
      layer.append(frame);
      const text = item.kind === 'heading' ? `H${item.level}` : item.role;
      const x = Math.max(rect.left, 4);
      const y = Math.max(rect.top - (item.kind === 'landmark' ? 0 : 22), 4);
      badge(layer, text, item.kind === 'heading' ? x : Math.max(rect.right - 4, 60), y, item.kind, false)
        .style.transform = item.kind === 'landmark' ? 'translateX(-100%)' : '';
    });
  }

  function clippingAncestorX(node) {
    for (let current = node.parentElement; current && current !== document.body && current !== document.documentElement; current = current.parentElement) {
      if (getComputedStyle(current).overflowX !== 'visible') return current;
    }
    return null;
  }

  function automaticMinWidth(node, cs, rect) {
    const parent = node.parentElement;
    if (!parent || cs.minWidth !== 'auto' || !/visible|clip/.test(cs.overflowX)) return false;
    if (!/(flex|grid)$/.test(getComputedStyle(parent).display)) return false;
    const box = parent.getBoundingClientRect();
    return rect.right > box.right + 0.5 || rect.width > parent.clientWidth + 0.5;
  }

  function overflowCause(node, cs, rect) {
    const causes = [];
    if (innerWidth > document.documentElement.clientWidth && Math.abs(rect.width - innerWidth) < 1) causes.push('width ≈ 100vw (includes the scrollbar)');
    if (automaticMinWidth(node, cs, rect)) causes.push('min-width: auto on a flex/grid item (try min-width: 0)');
    if (cs.minWidth !== '0px' && cs.minWidth !== 'auto' && px(cs.minWidth) > 0) causes.push(`min-width ${cs.minWidth}`);
    if (cs.whiteSpace === 'nowrap' || cs.whiteSpace === 'pre') causes.push(cs.whiteSpace);
    if (px(cs.marginRight) < 0) causes.push(`margin-right ${cs.marginRight}`);
    if (px(cs.marginLeft) < 0) causes.push(`margin-left ${cs.marginLeft}`);
    if (cs.transform !== 'none') causes.push('transformed');
    if (cs.position === 'absolute') causes.push('absolute');
    return causes;
  }

  function scanOverflow() {
    const viewport = document.documentElement.clientWidth;
    const items = [];
    const fixed = [];
    let count = 0;
    for (const node of document.body?.querySelectorAll('*') || []) {
      if (++count > 5000) break;
      if (fixed.some((parent) => parent.contains(node))) continue;
      const cs = getComputedStyle(node);
      if (cs.display === 'none' || cs.display === 'contents') continue;
      if (cs.position === 'fixed') {
        fixed.push(node);
        continue;
      }
      const rect = node.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) continue;

      const left = rect.left + scrollX;
      const right = rect.right + scrollX;
      if (right > viewport + 0.5 || left < -0.5) {
        const parent = node.parentElement?.getBoundingClientRect();
        const parentOver = parent && (parent.right + scrollX > viewport + 0.5 || parent.left + scrollX < -0.5);
        if (!parentOver && !clippingAncestorX(node)) {
          const amount = right > viewport + 0.5 ? `+${r1(right - viewport)}px →` : `← ${r1(-left)}px`;
          const causes = overflowCause(node, cs, rect);
          items.push({ node, kind: 'overflow', label: [amount, ...causes].join(' · ') });
        }
      }

      const clipX = /hidden|clip/.test(cs.overflowX) && node.scrollWidth > node.clientWidth + 1;
      const clipY = /hidden|clip/.test(cs.overflowY) && node.scrollHeight > node.clientHeight + 1;
      if (clipX || clipY) {
        const parts = [];
        if (clipX) parts.push(`clips ${node.scrollWidth - node.clientWidth}px wide`);
        if (clipY) parts.push(`clips ${node.scrollHeight - node.clientHeight}px tall`);
        if (cs.textOverflow === 'ellipsis') parts.push('ellipsis');
        items.push({ node, kind: 'clips', label: parts.join(' · ') });
      }
      if (items.length >= 300) break;
    }
    return items;
  }

  function overflowSummary() {
    const html = document.documentElement;
    const extra = html.scrollWidth - html.clientWidth;
    const clipped = [html, document.body].some((node) => node && /hidden|clip/.test(getComputedStyle(node).overflowX));
    if (extra > 0) return `Page scrolls horizontally by ${extra}px.`;
    return clipped ? 'No horizontal page scroll, but html/body clips overflow-x, so overflow may be hidden.' : 'No horizontal page scroll.';
  }

  function drawOverflow(items, layer) {
    items.forEach((item) => {
      const rect = item.node.getBoundingClientRect();
      if (!onScreen(rect)) return;
      const frame = el('div', `overflow__frame${item.kind === 'clips' ? ' overflow__frame--clips' : ''}`);
      place(frame, rect);
      layer.append(frame);
      const short = item.label.split(' · ')[0];
      badge(layer, short, Math.min(Math.max(rect.left, 4), innerWidth - 120), Math.max(rect.top, 4), item.kind, false);
    });
  }

  const maps = {
    focus: {
      enabled: () => state.showFocusMap,
      interval: 300,
      scan: () => focusStops().map((node) => ({ node })),
      describe: (items) => String(items.length),
      draw: drawFocusMap
    },
    headings: {
      enabled: () => state.showHeadings,
      interval: 1000,
      idle: true,
      scan: scanOutline,
      describe: describeOutline,
      draw: drawOutline
    },
    overflow: {
      enabled: () => state.showOverflow,
      interval: 2000,
      idle: true,
      scan: scanOverflow,
      describe: (items) => `${overflowSummary()}|${items.map((item) => `${item.kind}:${item.label}`).join('|')}`,
      draw: drawOverflow
    }
  };

  function applyScan(map, items) {
    map.items = items;
    const content = map.describe(items);
    map.geometry = '';
    if (content !== map.content) {
      map.content = content;
      invalidate();
    }
  }

  function refreshMap(name, force) {
    const map = maps[name];
    const layer = layers[name];
    if (!map.enabled()) {
      if (map.items) {
        map.items = null;
        map.content = null;
        map.geometry = '';
        clear(layer);
      }
      return;
    }
    const now = performance.now();
    if (!map.pending && (!map.items || now - (map.scanned || 0) >= map.interval)) {
      map.scanned = now;
      if (map.idle) {
        map.pending = true;
        idle(() => {
          map.pending = false;
          if (state.active && map.enabled()) applyScan(map, map.scan());
        });
      } else applyScan(map, map.scan());
    }
    if (!map.items) return;
    const geometry = map.items.map(({ node }) => {
      const rect = node.getBoundingClientRect();
      return `${r1(rect.left)}:${r1(rect.top)}:${r1(rect.width)}:${r1(rect.height)}`;
    }).join('|') || '-';
    if (!force && geometry === map.geometry) return;
    map.geometry = geometry;
    clear(layer);
    map.draw(map.items, layer);
  }

  function refreshMaps(force) {
    Object.keys(maps).forEach((name) => refreshMap(name, force));
  }

  function toggleFocusMap() {
    state.showFocusMap = !state.showFocusMap;
    if (state.showFocusMap) {
      const stops = focusStops();
      const positive = stops.filter((node) => node.tabIndex > 0).length;
      const small = stops.filter((node) => isSmallTarget(node.getBoundingClientRect())).length;
      const notes = [`Focus map · ${stops.length} stops`];
      if (positive) notes.push(`${positive} with tabindex > 0`);
      if (small) notes.push(`${small} under 24×24 (dotted)`);
      toast(notes.join(' · '));
    } else toast('Focus map off');
  }

  /* ---------- measurement ---------- */

  function metrics(node) {
    const rect = node.getBoundingClientRect();
    const cs = getComputedStyle(node);
    return {
      rect,
      cs,
      margin: { top: px(cs.marginTop), right: px(cs.marginRight), bottom: px(cs.marginBottom), left: px(cs.marginLeft) },
      border: { top: px(cs.borderTopWidth), right: px(cs.borderRightWidth), bottom: px(cs.borderBottomWidth), left: px(cs.borderLeftWidth) },
      padding: { top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) }
    };
  }

  function describe(node) {
    if (!node) return '';
    const id = node.id ? `#${node.id}` : '';
    const classes = typeof node.className === 'string'
      ? node.className.trim().split(/\s+/).filter(Boolean).slice(0, 3).map((name) => `.${name}`).join('')
      : '';
    return `${node.tagName.toLowerCase()}${id}${classes}`;
  }

  function classNames(node) {
    return node?.classList ? [...node.classList] : [];
  }

  function rootFontSize() {
    return px(getComputedStyle(document.documentElement).fontSize) || 16;
  }

  const remOf = (value) => String(Math.round((value / rootFontSize()) * 1000) / 1000);

  function offScale(value) {
    if (!state.showSpacing || Math.abs(value) < 0.05) return false;
    const steps = value / state.spacingBase;
    return Math.abs(steps - Math.round(steps)) > 0.02;
  }

  function drawBoxModel(node) {
    const { rect, margin, border, padding } = metrics(node);
    const marginBox = {
      left: rect.left - margin.left,
      top: rect.top - margin.top,
      width: rect.width + margin.left + margin.right,
      height: rect.height + margin.top + margin.bottom
    };
    const paddingBox = {
      left: rect.left + border.left,
      top: rect.top + border.top,
      width: rect.width - border.left - border.right,
      height: rect.height - border.top - border.bottom
    };
    const contentBox = {
      left: paddingBox.left + padding.left,
      top: paddingBox.top + padding.top,
      width: paddingBox.width - padding.left - padding.right,
      height: paddingBox.height - padding.top - padding.bottom
    };

    [['margin', marginBox], ['border', rect], ['padding', paddingBox], ['content', contentBox]].forEach(([name, box]) => {
      const layer = el('div', `box box--${name}`);
      place(layer, box);
      layers.box.append(layer);
    });
  }

  function chip(text, x, y, modifier, styles) {
    const node = el('span', `chip${modifier ? ` chip--${modifier}` : ''}`, styles);
    node.textContent = text;
    Object.assign(node.style, { left: `${x}px`, top: `${y}px` });
    layers.labels.append(node);
    return node;
  }

  function spacingLabels(node) {
    const { rect, margin, padding } = metrics(node);
    const outside = (value, room) => (Math.abs(value) < room ? Math.sign(value || 1) * (Math.abs(value) + room / 2) : value / 2);
    [
      [margin.top, rect.left + rect.width / 2, rect.top - outside(margin.top, 22), 'margin'],
      [margin.bottom, rect.left + rect.width / 2, rect.bottom + outside(margin.bottom, 22), 'margin'],
      [margin.left, rect.left - outside(margin.left, 48), rect.top + rect.height / 2, 'margin'],
      [margin.right, rect.right + outside(margin.right, 48), rect.top + rect.height / 2, 'margin'],
      [padding.top, rect.left + rect.width / 2, rect.top + padding.top / 2, 'padding'],
      [padding.bottom, rect.left + rect.width / 2, rect.bottom - padding.bottom / 2, 'padding'],
      [padding.left, rect.left + padding.left / 2, rect.top + rect.height / 2, 'padding'],
      [padding.right, rect.right - padding.right / 2, rect.top + rect.height / 2, 'padding']
    ].forEach(([value, x, y, kind]) => {
      if (kind === 'margin' ? Math.abs(value) < 1 : value < 4) return;
      const warn = offScale(Math.abs(value));
      chip(`${kind === 'margin' ? 'm' : 'p'} ${r1(value)}${warn ? ' !' : ''}`, x, y, warn ? 'warn' : kind, { transform: 'translate(-50%, -50%)' });
    });
  }

  const GENERIC_FONT = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|ui-monospace|ui-rounded|math|emoji|fangsong|-apple-system|BlinkMacSystemFont)$/i;
  const fontCache = new Map();
  const fontProbe = document.createElement('canvas').getContext('2d');
  ['loadingdone', 'loadingerror'].forEach((type) => document.fonts?.addEventListener(type, () => fontCache.clear()));

  function fontFamilies(value) {
    return (value.match(/"[^"]*"|'[^']*'|[^,]+/g) || [])
      .map((part) => part.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }

  function weightRange(face) {
    const [min, max = min] = face.weight.split(/\s+/).map((value) => (value === 'normal' ? 400 : value === 'bold' ? 700 : Number(value)));
    return [min, max];
  }

  function installedFont(family) {
    const sample = 'mmmmmmmmmmlli1WQ@#';
    return ['monospace', 'serif', 'sans-serif'].some((base) => {
      fontProbe.font = `72px ${base}`;
      const fallback = fontProbe.measureText(sample).width;
      fontProbe.font = `72px "${family}", ${base}`;
      return fontProbe.measureText(sample).width !== fallback;
    });
  }

  function webFontState(faces, weight) {
    const loaded = faces.filter((face) => face.status === 'loaded');
    if (loaded.length) {
      const covered = loaded.some((face) => {
        const [min, max] = weightRange(face);
        return weight >= min && weight <= max;
      });
      return { used: true, note: covered ? 'web font' : `web font, no ${weight} weight loaded so it is synthesized` };
    }
    if (faces.some((face) => face.status === 'error')) return { used: false, note: 'web font failed to load' };
    if (faces.some((face) => face.status === 'loading')) return { used: false, note: 'web font still loading' };
    return { used: false, note: 'web font not loaded' };
  }

  function renderedFont(cs) {
    const key = `${cs.fontFamily}|${cs.fontWeight}|${cs.fontStyle}`;
    if (fontCache.has(key)) return fontCache.get(key);
    const weight = Number(cs.fontWeight) || 400;
    const faces = [...(document.fonts || [])];
    const skipped = [];
    let result = '';
    for (const family of fontFamilies(cs.fontFamily)) {
      if (GENERIC_FONT.test(family)) {
        result = `${family} (browser default)`;
        break;
      }
      const own = faces.filter((face) => face.family.replace(/^["']|["']$/g, '').toLowerCase() === family.toLowerCase());
      if (own.length) {
        const { used, note } = webFontState(own, weight);
        if (used) {
          result = `${family} (${note})`;
          break;
        }
        skipped.push(`${family}: ${note}`);
        continue;
      }
      if (installedFont(family)) {
        result = `${family} (installed on this computer)`;
        break;
      }
      skipped.push(`${family}: not installed`);
    }
    const text = [result || 'browser default', ...(skipped.length ? [`skipped ${skipped.join(', ')}`] : [])].join(' · ');
    fontCache.set(key, text);
    return text;
  }

  function layoutSummary(cs, node) {
    const pairs = [['display', cs.display]];
    if (cs.position !== 'static') pairs.push(['position', cs.position]);
    if (cs.display.includes('grid')) {
      pairs.push(
        ['cols', cs.gridTemplateColumns],
        ['rows', cs.gridTemplateRows],
        ['gap', `${r1(px(cs.rowGap))} / ${r1(px(cs.columnGap))}`],
        ['align', cs.alignItems],
        ['justify', cs.justifyItems]
      );
    } else if (cs.display.includes('flex')) {
      pairs.push(
        ['flex-flow', `${cs.flexDirection} ${cs.flexWrap}`],
        ['gap', `${r1(px(cs.rowGap))} / ${r1(px(cs.columnGap))}`],
        ['justify', cs.justifyContent],
        ['align', cs.alignItems]
      );
    }
    const rem = state.showSpacing ? ` (${remOf(px(cs.fontSize))}rem)` : '';
    pairs.push(
      ['font-family', cs.fontFamily],
      ['font used', renderedFont(cs)],
      ['font-size', `${cs.fontSize}${rem}`],
      ['line-height', cs.lineHeight],
      ['font-weight', cs.fontWeight],
      ['color', hexOf(cs.color)]
    );
    if (state.showLayers && cs.position !== 'static') pairs.push(...layerPairs(node, cs));
    return pairs;
  }

  function drawTip(node, info) {
    const { rect, cs } = metrics(node);
    const tip = el('div', 'tip');

    const name = el('span', 'tip__name');
    name.textContent = describe(node);
    const size = el('span', 'tip__size');
    size.textContent = `${r1(rect.width)} × ${r1(rect.height)}`;
    tip.append(name, size);

    const pairs = layoutSummary(cs, node);
    const fact = (key) => info?.facts.find(([name]) => name === key)?.[1];
    if (info) {
      pairs.push(
        ['role', info.role],
        ['name', info.name ? `“${info.name.slice(0, 60)}”` : '(none)'],
        ['contrast', fact('contrast')],
        ['fill', fact('fill')],
        ['target', fact('target')]
      );
    }
    const list = el('dl', 'tip__facts');
    pairs.filter(([, value]) => value).forEach(([key, value]) => {
      const term = el('dt', 'tip__key');
      term.textContent = key;
      const detail = el('dd', 'tip__value');
      detail.textContent = value;
      list.append(term, detail);
    });
    tip.append(list);
    info?.flags.forEach((flag) => {
      const issue = el('span', 'tip__issue');
      issue.textContent = `⚠ ${flag}`;
      tip.append(issue);
    });
    if (isFrame(node)) {
      const hint = el('span', 'tip__hint');
      hint.textContent = 'iframe · Enter to inspect inside';
      tip.append(hint);
    }

    layers.labels.append(tip);
    const { width, height } = tip.getBoundingClientRect();
    const { left, top } = tipPosition(node, width, height);
    Object.assign(tip.style, { left: `${left}px`, top: `${top}px` });
  }

  function overlap(a, b) {
    const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return width > 0 && height > 0 ? width * height : 0;
  }

  function tipObstacles(node, avoid) {
    const obstacles = [{ rect: avoid, weight: 4 }];
    if (!state.poppedOut && panelBody) obstacles.push({ rect: panelBody.getBoundingClientRect(), weight: 4 });
    state.pins.forEach((pin) => {
      if (pin.el.isConnected && pin.el !== node) obstacles.push({ rect: pin.el.getBoundingClientRect(), weight: 1 });
    });
    return obstacles;
  }

  function tipPosition(node, width, height) {
    const { rect, cs, margin } = metrics(node);
    const gap = 8;
    const labelGutter = state.showLayout && cs.display.includes('grid') ? 56 : gap;
    const avoid = {
      left: rect.left - margin.left - labelGutter,
      top: rect.top - margin.top - gap,
      right: rect.right + margin.right + gap,
      bottom: rect.bottom + margin.bottom + gap
    };
    const clampX = (value) => Math.max(4, Math.min(value, innerWidth - width - 4));
    const clampY = (value) => Math.max(4, Math.min(value, innerHeight - height - 4));
    const candidates = [
      { left: rect.left, top: avoid.bottom },
      { left: rect.left, top: avoid.top - height },
      { left: avoid.right, top: rect.top },
      { left: avoid.left - width, top: rect.top },
      { left: 8, top: 8 },
      { left: innerWidth - width - 8, top: 8 },
      { left: 8, top: innerHeight - height - 8 },
      { left: innerWidth - width - 8, top: innerHeight - height - 8 }
    ].map(({ left, top }) => ({ left: clampX(left), top: clampY(top) }));

    const obstacles = tipObstacles(node, avoid);
    const score = ({ left, top }) => {
      const box = { left, top, right: left + width, bottom: top + height };
      return obstacles.reduce((sum, { rect: obstacle, weight }) => sum + overlap(box, obstacle) * weight, 0);
    };

    return candidates.reduce((best, candidate) => (score(candidate) < score(best) ? candidate : best));
  }

  /* ---------- grid & flex overlays ---------- */

  function tracks(value) {
    if (!value || value === 'none') return [];
    return value.split(' ').map(parseFloat).filter((n) => !Number.isNaN(n));
  }

  function addTrack(box, modifier, label, warn) {
    const node = el('div', `track${modifier ? ` track--${modifier}` : ''}`);
    place(node, box);
    layers.layout.append(node);
    if (label) {
      chip(warn ? `${label} !` : label, box.left + box.width / 2, box.top + box.height / 2, warn ? 'warn' : 'track', { transform: 'translate(-50%, -50%)' });
    }
  }

  function contentMode(value, rtl) {
    const mode = value.replace(/^(safe|unsafe)\s+/, '');
    if (mode === 'left') return rtl ? 'end' : 'start';
    if (mode === 'right') return rtl ? 'start' : 'end';
    return mode;
  }

  function distribute(free, count, mode) {
    if (free <= 0.5 || !count) return { offset: 0, extra: 0 };
    if (mode === 'center') return { offset: free / 2, extra: 0 };
    if (mode === 'end' || mode === 'flex-end') return { offset: free, extra: 0 };
    if (mode === 'space-between') return { offset: 0, extra: count > 1 ? free / (count - 1) : 0 };
    if (mode === 'space-around') return { offset: free / count / 2, extra: free / count };
    if (mode === 'space-evenly') return { offset: free / (count + 1), extra: free / (count + 1) };
    return { offset: 0, extra: 0 };
  }

  function drawGrid(node, cs) {
    const { rect, border, padding } = metrics(node);
    const scaleX = node.offsetWidth ? rect.width / node.offsetWidth : 1;
    const scaleY = node.offsetHeight ? rect.height / node.offsetHeight : 1;
    const originX = rect.left + (border.left + padding.left) * scaleX;
    const originY = rect.top + (border.top + padding.top) * scaleY;

    const subgrid = [cs.gridTemplateColumns, cs.gridTemplateRows].some((value) => value.startsWith('subgrid'));
    if (subgrid) chip('subgrid', originX, originY, 'track', { transform: 'translateY(-100%)' });

    const cols = tracks(cs.gridTemplateColumns);
    const rows = tracks(cs.gridTemplateRows);
    if (!cols.length && !rows.length) return;

    const rtl = cs.direction === 'rtl';
    const columnGap = px(cs.columnGap);
    const rowGap = px(cs.rowGap);
    const contentWidth = node.clientWidth - padding.left - padding.right;
    const contentHeight = node.clientHeight - padding.top - padding.bottom;
    const usedWidth = cols.reduce((sum, n) => sum + n, 0) + Math.max(cols.length - 1, 0) * columnGap;
    const usedHeight = rows.reduce((sum, n) => sum + n, 0) + Math.max(rows.length - 1, 0) * rowGap;
    const inline = distribute(contentWidth - usedWidth, cols.length, contentMode(cs.justifyContent, rtl));
    const block = distribute(contentHeight - usedHeight, rows.length, contentMode(cs.alignContent, false));
    const colStep = columnGap + inline.extra;
    const rowStep = rowGap + block.extra;
    const gridWidth = (usedWidth + inline.extra * Math.max(cols.length - 1, 0)) * scaleX;
    const gridHeight = (usedHeight + block.extra * Math.max(rows.length - 1, 0)) * scaleY;
    const startX = rtl
      ? originX + (contentWidth - inline.offset - node.scrollLeft) * scaleX - gridWidth
      : originX + (inline.offset - node.scrollLeft) * scaleX;
    const startY = originY + (block.offset - node.scrollTop) * scaleY;
    const gapWarn = offScale(columnGap);
    const rowWarn = offScale(rowGap);

    const ordered = rtl ? cols.slice().reverse() : cols;
    let x = startX;
    ordered.forEach((width, index) => {
      addTrack({ left: x, top: startY, width: width * scaleX, height: gridHeight }, '', `${r1(width)}`);
      x += width * scaleX;
      if (index < ordered.length - 1 && colStep > 0) {
        addTrack({ left: x, top: startY, width: colStep * scaleX, height: gridHeight }, 'gap', colStep >= 16 ? `${r1(colStep)}` : '', gapWarn && !inline.extra);
        x += colStep * scaleX;
      }
    });

    let y = startY;
    rows.forEach((height, index) => {
      addTrack({ left: startX, top: y, width: gridWidth, height: height * scaleY }, '', '');
      chip(`${r1(height)}`, startX - 4, y + (height * scaleY) / 2, 'track', { transform: 'translate(-100%, -50%)' });
      y += height * scaleY;
      if (index < rows.length - 1 && rowStep > 0) {
        addTrack({ left: startX, top: y, width: gridWidth, height: rowStep * scaleY }, 'gap', rowStep >= 16 ? `${r1(rowStep)}` : '', rowWarn && !block.extra);
        y += rowStep * scaleY;
      }
    });
  }

  function drawFlex(node, cs) {
    const rects = [...node.children]
      .filter((child) => getComputedStyle(child).display !== 'none')
      .map((child) => child.getBoundingClientRect());
    rects.forEach((rect) => addTrack(rect, 'item', ''));

    const horizontal = cs.flexDirection.startsWith('row');
    const cssGap = px(horizontal ? cs.columnGap : cs.rowGap);
    const sorted = rects.slice().sort((a, b) => (horizontal ? a.left - b.left : a.top - b.top));
    const warn = (gap) => offScale(cssGap) && Math.abs(gap - cssGap) < 0.5;

    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      if (horizontal) {
        const gap = current.left - previous.right;
        if (gap < 0.5) continue;
        const top = Math.max(previous.top, current.top);
        addTrack({
          left: previous.right,
          top,
          width: gap,
          height: Math.max(Math.min(previous.bottom, current.bottom) - top, 2)
        }, 'gap', `${r1(gap)}`, warn(gap));
      } else {
        const gap = current.top - previous.bottom;
        if (gap < 0.5) continue;
        const left = Math.max(previous.left, current.left);
        addTrack({
          left,
          top: previous.bottom,
          width: Math.max(Math.min(previous.right, current.right) - left, 2),
          height: gap
        }, 'gap', `${r1(gap)}`, warn(gap));
      }
    }
  }

  function drawLayout(node) {
    const cs = getComputedStyle(node);
    if (cs.display.includes('grid')) drawGrid(node, cs);
    else if (cs.display.includes('flex')) drawFlex(node, cs);
  }

  /* ---------- layout grid & breakpoint ---------- */

  function activePreset() {
    const sorted = state.presets.slice().sort((a, b) => b.minWidth - a.minWidth);
    return sorted.find((preset) => preset.minWidth <= innerWidth) || sorted[sorted.length - 1];
  }

  const SAFE_AREAS = [
    { screen: '2560 × 1440', width: 2560, fold: 1305 },
    { screen: '1920 × 1080', width: 1920, fold: 945 },
    { screen: '1440 × 900', width: 1440, fold: 790 },
    { screen: '1536 × 864', width: 1536, fold: 730 },
    { screen: '1366 × 768', width: 1366, fold: 657 }
  ];

  function safeAreaFor(width) {
    if (width < 1024) return null;
    return SAFE_AREAS.reduce((best, area) => (Math.abs(area.width - width) < Math.abs(best.width - width) ? area : best));
  }

  function viewportText() {
    const safe = safeAreaFor(innerWidth);
    const parts = [`viewport ${innerWidth} × ${innerHeight}`];
    if (safe) parts.push(`safe area ≈ ${safe.width} × ${safe.fold} (${safe.screen} screen)`);
    return parts.join(' · ');
  }

  function drawSafeAreas() {
    if (!state.showSafeAreas) return;
    const current = safeAreaFor(innerWidth);
    SAFE_AREAS.forEach((area) => {
      const top = area.fold - scrollY;
      if (top < 0 || top > innerHeight) return;
      layers.grid.append(el('div', 'fold__shade', { top: `${top}px` }));
      layers.grid.append(el('div', 'fold', { top: `${top}px` }));
      const label = `${area.screen} screen · fold ≈ ${area.fold}px${area === current ? ' · closest to this width' : ''}`;
      chip(label, innerWidth - 12, top - 12, 'fold', { transform: 'translate(-100%, -50%)' });
    });
  }

  function blockChildren(node) {
    return [...node.children].flatMap((child) => {
      if (child === host || child === designHost) return [];
      const cs = getComputedStyle(child);
      if (cs.display === 'contents') return blockChildren(child);
      if (cs.display === 'none' || /^(absolute|fixed)$/.test(cs.position)) return [];
      if (!child.checkVisibility({ visibilityProperty: true })) return [];
      return child.getBoundingClientRect().height > 1 ? [child] : [];
    });
  }

  function pageSections() {
    let container = document.querySelector('main') || document.body;
    for (let depth = 0; container && depth < 12; depth += 1) {
      const children = blockChildren(container);
      const height = container.getBoundingClientRect().height || 1;
      if (children.length !== 1 || children[0].getBoundingClientRect().height < height * 0.9) {
        return children.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      }
      container = children[0];
    }
    return [];
  }

  function sectionGaps() {
    const sections = pageSections();
    const gaps = [];
    for (let index = 1; index < sections.length; index += 1) {
      const above = metrics(sections[index - 1]);
      const below = metrics(sections[index]);
      const gap = below.rect.top - above.rect.bottom;
      const paddingBottom = above.padding.bottom + above.border.bottom;
      const paddingTop = below.padding.top + below.border.top;
      gaps.push({
        above: sections[index - 1],
        below: sections[index],
        top: above.rect.bottom - paddingBottom,
        gapTop: above.rect.bottom,
        gapBottom: below.rect.top,
        bottom: below.rect.top + paddingTop,
        left: Math.min(above.rect.left, below.rect.left),
        right: Math.max(above.rect.right, below.rect.right),
        total: paddingBottom + gap + paddingTop,
        parts: [
          ['pb', paddingBottom],
          ['mb', above.margin.bottom],
          ['mt', below.margin.top],
          ['gap', gap],
          ['pt', paddingTop]
        ]
      });
    }
    return gaps;
  }

  function rhythmLabel(item) {
    const part = (key) => item.parts.find(([name]) => name === key)[1];
    const shown = [];
    if (part('pb') >= 0.5) shown.push(`pb ${r1(part('pb'))}`);
    if (Math.abs(part('gap')) >= 0.5) {
      const margins = [['mb', part('mb')], ['mt', part('mt')]].filter(([, value]) => Math.abs(value) >= 0.5).map(([key, value]) => `${key} ${r1(value)}`);
      shown.push(`gap ${r1(part('gap'))}${margins.length ? ` (${margins.join(' / ')})` : ''}`);
    }
    if (part('pt') >= 0.5) shown.push(`pt ${r1(part('pt'))}`);
    return `${r1(item.total)}px${shown.length ? ` · ${shown.join(' · ')}` : ''}`;
  }

  function drawSections() {
    if (!state.showSections) return;
    const gaps = sectionGaps();
    state.sectionItems = gaps.map((item) => item.below);
    gaps.forEach((item) => {
      if (item.bottom < 0 || item.top > innerHeight) return;
      const width = item.right - item.left;
      [
        ['rhythm rhythm--padding', item.top, item.gapTop],
        ['rhythm rhythm--gap', item.gapTop, item.gapBottom],
        ['rhythm rhythm--padding', item.gapBottom, item.bottom]
      ].forEach(([className, from, to]) => {
        if (to - from < 0.5) return;
        const band = el('div', className);
        place(band, { left: item.left, top: from, width, height: to - from });
        layers.grid.append(band);
      });
      chip(rhythmLabel(item), Math.max(item.left, 0) + 16, (item.top + item.bottom) / 2, 'rhythm', { transform: 'translateY(-50%)' });
    });
  }

  function sectionSlice() {
    const gaps = sectionGaps();
    const counts = new Map();
    gaps.forEach((item) => counts.set(r1(item.total), (counts.get(r1(item.total)) || 0) + 1));
    const summary = [...counts].sort((a, b) => b[1] - a[1]).map(([value, count]) => `${value}px ×${count}`).join(' · ');
    return {
      summary: gaps.length ? `${counts.size} different ${counts.size === 1 ? 'spacing' : 'spacings'}: ${summary}` : '',
      items: gaps.map((item, index) => ({
        index,
        name: `${describe(item.above)} → ${describe(item.below)}`,
        label: rhythmLabel(item)
      }))
    };
  }

  function drawLayoutGrid() {
    if (!state.showGrid) return;
    const preset = activePreset();
    if (!preset) return;
    const width = document.documentElement.clientWidth;
    const columns = Math.max(1, Math.round(preset.columns) || 1);
    const gutter = Math.max(0, preset.gutter || 0);
    const available = Math.max(0, width - 2 * Math.max(0, preset.margin || 0));
    const container = preset.maxWidth ? Math.min(available, preset.maxWidth) : available;
    const left = (width - container) / 2;
    const column = Math.max(0, (container - gutter * (columns - 1)) / columns);
    for (let index = 0; index < columns; index += 1) {
      const node = el('div', 'gridcol', { left: `${left + index * (column + gutter)}px`, width: `${column}px` });
      layers.grid.append(node);
    }
    const label = chip(`${viewportText()} · ${preset.name} ≥${preset.minWidth} · ${columns} cols · col ${r1(column)}`, width / 2, 8, 'viewport', { transform: 'translateX(-50%)' });
    layers.grid.append(label);
  }

  function drawGridRuler() {
    if (state.showGridRuler) layers.grid.append(el('div', 'gridruler'));
  }

  function setGridField(field, value) {
    const preset = activePreset();
    if (!preset) return;
    if (field === 'maxWidth') preset.maxWidth = value > 0 ? value : null;
    else if (field === 'columns') preset.columns = Math.max(1, Math.round(value || 1));
    else if (['gutter', 'margin', 'minWidth'].includes(field)) preset[field] = Math.max(0, value || 0);
    savePresets();
  }

  /* ---------- design image ---------- */

  const designKey = () => `${location.origin}${location.pathname}`;

  function dataUrlToBlob(dataUrl) {
    const [header, body] = dataUrl.split(',');
    const type = header.match(/data:([^;]+)/)?.[1] || 'image/png';
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type });
  }

  async function loadDesign() {
    const settingsKey = `design:${designKey()}`;
    const imageKey = `design-image:${designKey()}`;
    try {
      const stored = await chrome.storage.local.get([settingsKey, imageKey]);
      Object.assign(state.design, stored[settingsKey] || {});
      designImage?.close?.();
      designImage = stored[imageKey] ? await createImageBitmap(dataUrlToBlob(stored[imageKey])) : null;
    } catch (error) {
      designImage = null;
      toast('Could not load the design image');
    }
    state.design.has = Boolean(designImage);
    paintDesign();
    invalidate();
  }

  function saveDesignSettings() {
    const { has, ...settings } = state.design;
    chrome.storage.local.set({ [`design:${designKey()}`]: settings }).catch(() => {});
  }

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function useDesignFile(file) {
    if (!file?.type?.startsWith('image/')) {
      toast('Choose a PNG, JPG or WebP image');
      return;
    }
    try {
      await chrome.storage.local.set({ [`design-image:${designKey()}`]: await readAsDataUrl(file) });
      saveDesignSettings();
      await loadDesign();
      toast('Design image saved for this page');
    } catch (error) {
      toast('Could not save the design image');
    }
  }

  async function removeDesign() {
    await chrome.storage.local.remove([`design-image:${designKey()}`, `design:${designKey()}`]).catch(() => {});
    designImage?.close?.();
    designImage = null;
    state.design = { has: false, opacity: 50, x: 0, y: 0, scale: '1', scroll: true, blend: false };
    paintDesign();
    invalidate();
    toast('Design image removed');
  }

  function paintDesign() {
    if (!designCanvas) return;
    if (!designImage) {
      designCanvas.width = 0;
      designCanvas.height = 0;
    } else if (designCanvas.source !== designImage) {
      const { width, height } = designImage;
      const factor = Math.min(1, 16384 / width, 16384 / height, Math.sqrt(100e6 / (width * height)));
      designCanvas.width = Math.round(width * factor);
      designCanvas.height = Math.round(height * factor);
      designCanvas.getContext('2d').drawImage(designImage, 0, 0, designCanvas.width, designCanvas.height);
      if (factor < 1) toast('Large design image shown at reduced resolution');
    }
    designCanvas.source = designImage;
    placeDesign();
  }

  function setBlend(on) {
    designHost.style.mixBlendMode = on ? 'difference' : '';
    const html = document.documentElement;
    if (on && rootBackground === null) {
      const transparent = (node) => !node || rgba(getComputedStyle(node).backgroundColor)[3] === 0;
      if (transparent(html) && transparent(document.body)) {
        rootBackground = html.style.backgroundColor;
        html.style.backgroundColor = 'Canvas';
      }
    } else if (!on && rootBackground !== null) {
      html.style.backgroundColor = rootBackground;
      rootBackground = null;
    }
  }

  function placeDesign() {
    if (!designCanvas) return;
    const visible = state.active && state.showDesign && Boolean(designImage);
    designCanvas.hidden = !visible;
    setBlend(visible && state.design.blend);
    designCanvas.classList.toggle('design--draggable', visible && state.designDrag);
    if (!visible) return;
    const { opacity, x, y, scale, scroll } = state.design;
    const width = scale === 'fit' ? document.documentElement.clientWidth : designImage.width / (scale === '2' ? 2 : 1);
    Object.assign(designCanvas.style, {
      width: `${width}px`,
      opacity: String(Math.min(100, Math.max(0, opacity)) / 100),
      transform: `translate(${x - (scroll ? scrollX : 0)}px, ${y - (scroll ? scrollY : 0)}px)`
    });
  }

  function onDesignDown(event) {
    if (!state.designDrag || event.button !== 0) return;
    designCanvas.setPointerCapture(event.pointerId);
    Object.assign(designMove, { active: true, startX: event.clientX, startY: event.clientY, x: state.design.x, y: state.design.y });
    event.preventDefault();
  }

  function onDesignMove(event) {
    if (!designMove.active) return;
    state.design.x = Math.round(designMove.x + event.clientX - designMove.startX);
    state.design.y = Math.round(designMove.y + event.clientY - designMove.startY);
    placeDesign();
    invalidate();
  }

  function onDesignUp() {
    if (!designMove.active) return;
    designMove.active = false;
    saveDesignSettings();
  }

  function setDesignField(field, value) {
    if (field === 'opacity') state.design.opacity = Math.min(100, Math.max(0, value ?? 50));
    else if (field === 'x' || field === 'y') state.design[field] = value || 0;
    else if (field === 'scale') state.design.scale = ['1', '2', 'fit'].includes(String(value)) ? String(value) : '1';
    placeDesign();
    saveDesignSettings();
  }

  /* ---------- distances & pins ---------- */

  function addRule(axis, from, to, cross, color) {
    const length = Math.abs(to - from);
    if (length < 0.5) return;
    const rule = el('div', `rule rule--${axis}`, { color });
    if (axis === 'h') {
      Object.assign(rule.style, { left: `${Math.min(from, to)}px`, top: `${cross}px`, width: `${length}px`, height: '0px' });
    } else {
      Object.assign(rule.style, { left: `${cross}px`, top: `${Math.min(from, to)}px`, width: '0px', height: `${length}px` });
    }
    layers.distance.append(rule);

    const x = axis === 'h' ? (from + to) / 2 : cross;
    const y = axis === 'h' ? cross : (from + to) / 2;
    chip(`${r1(length)}`, x, y, '', { transform: 'translate(-50%, -50%)', background: color, color: '#ffffff' });
  }

  function drawDistance(a, b, color) {
    const overlapX = a.left < b.right && b.left < a.right;
    const overlapY = a.top < b.bottom && b.top < a.bottom;

    if (overlapX && overlapY) {
      const midY = (Math.max(a.top, b.top) + Math.min(a.bottom, b.bottom)) / 2;
      const midX = (Math.max(a.left, b.left) + Math.min(a.right, b.right)) / 2;
      addRule('h', a.left, b.left, midY - 9, color);
      addRule('h', a.right, b.right, midY + 9, color);
      addRule('v', a.top, b.top, midX - 9, color);
      addRule('v', a.bottom, b.bottom, midX + 9, color);
      return;
    }

    if (!overlapX) {
      const cross = overlapY
        ? (Math.max(a.top, b.top) + Math.min(a.bottom, b.bottom)) / 2
        : (a.top + a.height / 2 + b.top + b.height / 2) / 2;
      const [from, to] = a.right <= b.left ? [a.right, b.left] : [b.right, a.left];
      addRule('h', from, to, cross, color);
    }
    if (!overlapY) {
      const cross = overlapX
        ? (Math.max(a.left, b.left) + Math.min(a.right, b.right)) / 2
        : (a.left + a.width / 2 + b.left + b.width / 2) / 2;
      const [from, to] = a.bottom <= b.top ? [a.bottom, b.top] : [b.bottom, a.top];
      addRule('v', from, to, cross, color);
    }
  }

  function drawPins() {
    state.pins.forEach((pin) => {
      if (!pin.el.isConnected) return;
      const rect = pin.el.getBoundingClientRect();
      const fill = el('div', 'pin', { color: pin.color });
      place(fill, rect);
      const frame = el('div', 'pin__frame', { color: pin.color });
      place(frame, rect);
      layers.pins.append(fill, frame);
      chip(
        `${describe(pin.el)} · ${r1(rect.width)} × ${r1(rect.height)}`,
        rect.left,
        Math.max(rect.top - 9, 9),
        '',
        { transform: 'translateY(-50%)', background: pin.color, color: '#ffffff' }
      );
    });
  }

  /* ---------- colour & contrast ---------- */

  const swatch = document.createElement('canvas');
  swatch.width = 1;
  swatch.height = 1;
  const swatchContext = swatch.getContext('2d', { willReadFrequently: true });

  function rgba(value) {
    swatchContext.clearRect(0, 0, 1, 1);
    swatchContext.fillStyle = '#000000';
    swatchContext.fillStyle = value;
    swatchContext.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = swatchContext.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
  }

  function over(top, under) {
    const alpha = top[3];
    return [0, 1, 2].map((i) => top[i] * alpha + under[i] * (1 - alpha)).concat(1);
  }

  function textPoint(node) {
    const range = document.createRange();
    for (const child of node.childNodes) {
      if (child.nodeType !== 3 || !child.nodeValue.trim()) continue;
      range.selectNodeContents(child);
      const rect = [...range.getClientRects()].find((box) => box.width > 0 && box.height > 0);
      if (rect) return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
    const rect = node.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  function paintStack(node) {
    const { x, y } = textPoint(node);
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return null;
    const stack = document.elementsFromPoint(x, y).filter((item) => item !== host && item !== designHost);
    const index = stack.indexOf(node);
    return index === -1 ? null : stack.slice(index);
  }

  function ancestors(node) {
    const list = [];
    for (let current = node; current; current = current.parentElement) list.push(current);
    return list;
  }

  function pageBase() {
    const scheme = getComputedStyle(document.documentElement).colorScheme || '';
    return /dark/.test(scheme) && !/light/.test(scheme) ? [18, 18, 18, 1] : [255, 255, 255, 1];
  }

  const MEDIA = /^(IMG|PICTURE|VIDEO|CANVAS|IFRAME|OBJECT|EMBED|svg|SVG)$/;

  function backgroundLayers(node, stack = paintStack(node)) {
    const layers = [];
    let image = false;
    for (const current of stack || ancestors(node)) {
      const cs = getComputedStyle(current);
      if (cs.backgroundImage !== 'none' || (current !== node && MEDIA.test(current.tagName))) image = true;
      const color = rgba(cs.backgroundColor);
      if (color[3] > 0) layers.push({ el: current, color });
      if (color[3] === 1 && groupOpacity(current) === 1) break;
    }
    return { layers: layers.reverse(), image, sampled: stack ? 'paint stack' : 'ancestors' };
  }

  function outermostGroup(el, scope) {
    let group = null;
    for (let current = el; current && current !== scope; current = current.parentElement) {
      if (parseFloat(getComputedStyle(current).opacity) < 1) group = current;
    }
    return group;
  }

  function compose(layers, backdropColor, scope = null) {
    let color = backdropColor;
    let i = 0;
    while (i < layers.length) {
      const group = outermostGroup(layers[i].el, scope);
      if (!group) {
        color = over(layers[i].color, color);
        i += 1;
        continue;
      }
      let j = i;
      while (j < layers.length && group.contains(layers[j].el)) j += 1;
      const inner = compose(layers.slice(i, j), color, group);
      color = over([...inner.slice(0, 3), parseFloat(getComputedStyle(group).opacity)], color);
      i = j;
    }
    return color;
  }

  function groupOpacity(node) {
    let opacity = 1;
    for (let current = node; current; current = current.parentElement) {
      const value = parseFloat(getComputedStyle(current).opacity);
      if (!Number.isNaN(value)) opacity *= value;
    }
    return opacity;
  }

  function channel(value) {
    const scaled = value / 255;
    return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  }

  function luminance([r, g, b]) {
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  }

  function hexOf(value) {
    const [r, g, b, a] = rgba(value);
    const alpha = a < 1 ? Math.round(a * 255).toString(16).padStart(2, '0') : '';
    return `${toHex([r, g, b])}${alpha}`;
  }

  function toHex(color) {
    return `#${color.slice(0, 3).map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`;
  }

  function pseudoBackground(node) {
    return ['::before', '::after'].some((which) => {
      const cs = getComputedStyle(node, which);
      return cs.content !== 'none' && cs.content !== 'normal' && (rgba(cs.backgroundColor)[3] > 0 || cs.backgroundImage !== 'none');
    });
  }

  function hasOwnText(node) {
    return [...node.childNodes].some((child) => child.nodeType === 3 && child.nodeValue.trim());
  }

  const CONTROLS = 'a[href], button, summary, input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"]';

  function textHost(node) {
    if (hasOwnText(node) || /^(INPUT|TEXTAREA|SELECT)$/.test(node.tagName)) return node;
    if (!node.matches(CONTROLS)) return null;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
      acceptNode: (text) => (text.nodeValue.trim() && !hiddenFromAT(text.parentElement) && !visuallyHidden(text.parentElement)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP)
    });
    return walker.nextNode()?.parentElement || (node.tagName === 'BUTTON' ? node : null);
  }

  function surroundFacts(node) {
    const own = rgba(getComputedStyle(node).backgroundColor);
    if (own[3] === 0 || !node.parentElement) return [];
    const base = pageBase();
    const fill = compose(backgroundLayers(node, ancestors(node)).layers, base);
    const around = compose(backgroundLayers(node.parentElement, ancestors(node.parentElement)).layers, base);
    const [light, dark] = [luminance(fill), luminance(around)].sort((a, b) => b - a);
    const ratio = (light + 0.05) / (dark + 0.05);
    return [['fill', `${toHex(fill)} vs ${toHex(around)} around · ${(Math.floor(ratio * 100) / 100).toFixed(2)}:1 (1.4.11, the label usually identifies the control)`]];
  }

  function contrastFacts(target) {
    const node = textHost(target);
    if (!node) return [];

    const cs = getComputedStyle(node);
    const { layers, image, sampled } = backgroundLayers(node);
    const base = pageBase();
    const background = compose(layers, base);
    const ink = compose(layers.concat({ el: node, color: rgba(cs.color) }), base);
    const [light, dark] = [luminance(ink), luminance(background)].sort((a, b) => b - a);
    const ratio = (light + 0.05) / (dark + 0.05);
    const size = px(cs.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
    const grade = (min) => (ratio >= min ? 'pass' : 'fail');
    const notes = [
      `${(Math.floor(ratio * 100) / 100).toFixed(2)}:1`,
      `AA ${grade(large ? 3 : 4.5)}`,
      `AAA ${grade(large ? 4.5 : 7)}`
    ];
    if (large) notes.push('large text');
    if (image) notes.push('over an image or gradient, verify');
    if (sampled === 'ancestors') notes.push('background from ancestors only, verify');
    if (pseudoBackground(node)) notes.push('::before/::after background not sampled');

    const facts = [['text', toHex(ink)], ['background', toHex(background)], ['contrast', notes.join(' · ')]];
    if (node !== target) facts.unshift(['text in', describe(node)]);
    const control = target.closest(CONTROLS);
    if (control) facts.push(...surroundFacts(control));
    return facts;
  }

  /* ---------- absolute / fixed elements ---------- */

  const positioned = { list: [], time: -Infinity, pending: false };

  function allPositioned() {
    if (!positioned.pending && performance.now() - positioned.time > 1000) {
      positioned.pending = true;
      idle(() => {
        const list = [...document.querySelectorAll('*')]
          .filter((node) => node !== host && node !== designHost && isLayer(getComputedStyle(node)))
          .slice(0, 500);
        const changed = list.length !== positioned.list.length || list.some((node, index) => node !== positioned.list[index]);
        positioned.list = list;
        positioned.time = performance.now();
        positioned.pending = false;
        if (changed && state.active) invalidate();
      });
    }
    return positioned.list;
  }

  function isLayer(cs) {
    return /^(absolute|fixed|sticky)$/.test(cs.position) || (cs.position === 'relative' && cs.zIndex !== 'auto');
  }

  function layersWithin(node) {
    const area = node.getBoundingClientRect();
    return allPositioned()
      .filter((child) => child !== node && child.isConnected && !child.contains(node))
      .filter((child) => node.contains(child) || overlap(area, child.getBoundingClientRect()) > 0);
  }

  function positionedWithin(node) {
    return layersWithin(node)
      .filter((child) => /^(absolute|fixed)$/.test(getComputedStyle(child).position))
      .slice(0, 40);
  }

  function createsContext(node, cs) {
    if (node === document.documentElement) return true;
    if (/^(fixed|sticky)$/.test(cs.position)) return true;
    if (cs.zIndex !== 'auto' && (cs.position !== 'static' || /(flex|grid)$/.test(getComputedStyle(node.parentElement || node).display))) return true;
    if (parseFloat(cs.opacity) < 1 || cs.isolation === 'isolate' || cs.mixBlendMode !== 'normal') return true;
    if ([cs.transform, cs.filter, cs.perspective, cs.clipPath, cs.mask, cs.backdropFilter].some((value) => value && value !== 'none')) return true;
    if (/layout|paint|strict|content/.test(cs.contain) || /size/.test(cs.containerType)) return true;
    return /transform|opacity|filter|perspective|isolation|z-index/.test(cs.willChange);
  }

  function contextPath(node) {
    const path = [node];
    for (let current = node.parentElement; current; current = current.parentElement) {
      if (createsContext(current, getComputedStyle(current))) path.push(current);
    }
    return path;
  }

  function zKey(node) {
    const z = parseInt(getComputedStyle(node).zIndex, 10);
    return Number.isNaN(z) ? 0 : z;
  }

  function frontFirst(a, b) {
    if (a.contains(b)) return 1;
    if (b.contains(a)) return -1;
    const pathA = contextPath(a);
    const pathB = contextPath(b);
    const indexA = pathA.findIndex((item, index) => index > 0 && pathB.indexOf(item) > 0);
    const common = pathA[indexA];
    const childA = indexA > 0 ? pathA[indexA - 1] : a;
    const childB = common ? pathB[pathB.indexOf(common) - 1] : b;
    const difference = zKey(childB) - zKey(childA);
    if (difference) return difference;
    return childA.compareDocumentPosition(childB) & Node.DOCUMENT_POSITION_FOLLOWING ? 1 : -1;
  }

  function containingBlock(node, cs) {
    if (cs.position === 'relative' || cs.position === 'sticky') return node.parentElement;
    for (let current = node.parentElement; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (cs.position === 'absolute' && style.position !== 'static') return current;
      if ([style.transform, style.filter, style.perspective].some((value) => value && value !== 'none')) return current;
      if (/layout|paint|strict|content/.test(style.contain) || /transform|filter|perspective/.test(style.willChange)) return current;
    }
    return null;
  }

  function insetText(node) {
    const map = node.computedStyleMap?.();
    const sides = ['top', 'right', 'bottom', 'left']
      .map((side) => [side, map ? String(map.get(side)) : getComputedStyle(node)[side]])
      .filter(([, value]) => value !== 'auto');
    return sides.length ? sides.map(([side, value]) => `${side} ${value}`).join(' · ') : 'auto';
  }

  function layerPairs(node, cs) {
    const block = containingBlock(node, cs);
    const context = contextPath(node).find((item) => item !== node);
    return [
      ['position', cs.position],
      ['z-index', cs.zIndex],
      ['inset', insetText(node)],
      ['relative to', block ? describe(block) : 'viewport'],
      ['stacking in', context ? describe(context) : 'root'],
      ['own context', createsContext(node, cs) ? 'yes' : 'no']
    ];
  }

  function layerList(node) {
    const list = layersWithin(node).slice(0, 40);
    if (isLayer(getComputedStyle(node))) list.push(node);
    return list.sort(frontFirst);
  }

  function drawLayers(node) {
    const list = layerList(node);
    const own = getComputedStyle(node);
    if (own.position !== 'static') {
      const block = containingBlock(node, own);
      if (block) {
        const frame = el('div', 'layer layer--block');
        place(frame, block.getBoundingClientRect());
        layers.layout.append(frame);
        chip('containing block', block.getBoundingClientRect().left, Math.max(block.getBoundingClientRect().bottom + 9, 9), 'block', { transform: 'translateY(-50%)', background: '#92400e', color: '#ffffff' });
      }
    }
    list.forEach((child) => {
      const rect = child.getBoundingClientRect();
      if (!rect.width && !rect.height) return;
      const frame = el('div', 'layer');
      place(frame, rect);
      layers.layout.append(frame);
      const label = `z ${getComputedStyle(child).zIndex}`;
      const target = el('button', 'chip chip--layer', { left: `${rect.right}px`, top: `${rect.top}px`, transform: 'translate(-100%, -100%)' });
      target.type = 'button';
      target.textContent = label;
      target.setAttribute('aria-label', `Inspect ${describe(child)}, z-index ${getComputedStyle(child).zIndex}`);
      target.addEventListener('click', () => lockOn(child));
      layers.labels.append(target);
    });
    state.layerItems = list;
  }

  function layerSlice(node) {
    return layerList(node).map((child, index) => {
      const cs = getComputedStyle(child);
      const rect = child.getBoundingClientRect();
      return {
        index,
        z: cs.zIndex,
        name: describe(child),
        current: child === node,
        facts: [...layerPairs(child, cs), ['size', `${r1(rect.width)} × ${r1(rect.height)}`]]
      };
    });
  }

  function lockOn(node) {
    state.hovered = node;
    state.locked = true;
    invalidate();
    toast('Locked · Esc or page click to release');
  }

  function drawPositioned(node) {
    positionedWithin(node).forEach((child) => {
      const rect = child.getBoundingClientRect();
      if (!rect.width && !rect.height) return;
      const frame = el('div', 'positioned');
      place(frame, rect);
      layers.layout.append(frame);
      const label = `${getComputedStyle(child).position} ${describe(child)}`;
      const target = el('button', 'chip chip--positioned', { left: `${rect.left}px`, top: `${rect.top}px`, transform: 'translateY(-100%)' });
      target.type = 'button';
      target.textContent = label;
      target.setAttribute('aria-label', `Inspect ${label}`);
      target.addEventListener('click', () => lockOn(child));
      layers.labels.append(target);
    });
  }

  function positionedFact(node) {
    const list = positionedWithin(node);
    if (!list.length) return [];
    const shown = list.slice(0, 6).map((child) => `${getComputedStyle(child).position} ${describe(child)}`);
    if (list.length > shown.length) shown.push(`+${list.length - shown.length} more`);
    return [['absolute / fixed', shown.join(', ')]];
  }

  /* ---------- facts, copy, report ---------- */

  function sides(box) {
    return [box.top, box.right, box.bottom, box.left];
  }

  function sideText(values) {
    const text = values.map(r1).join(' ');
    return state.showSpacing ? `${text} (${values.map(remOf).join(' ')}rem)` : text;
  }

  function offScaleFact(margin, padding, cs) {
    if (!state.showSpacing) return [];
    const found = [];
    ['top', 'right', 'bottom', 'left'].forEach((side) => {
      if (offScale(margin[side])) found.push(`margin-${side} ${r1(margin[side])}`);
      if (offScale(padding[side])) found.push(`padding-${side} ${r1(padding[side])}`);
    });
    if (/grid|flex/.test(cs.display)) {
      if (offScale(px(cs.rowGap))) found.push(`row-gap ${r1(px(cs.rowGap))}`);
      if (offScale(px(cs.columnGap))) found.push(`column-gap ${r1(px(cs.columnGap))}`);
    }
    return [['off-scale', found.length ? `! ${found.join(', ')}` : `none (base ${state.spacingBase}px)`]];
  }

  function factsFor(node) {
    const { rect, cs, margin, padding, border } = metrics(node);
    const size = `${r1(rect.width)} × ${r1(rect.height)}`;
    const rem = state.showSpacing ? ` (${remOf(rect.width)} × ${remOf(rect.height)}rem)` : '';
    const fontSize = state.showSpacing ? `${cs.fontSize} (${remOf(px(cs.fontSize))}rem)` : cs.fontSize;
    return [
      ['size', `${size}${rem}`],
      ['offset', `${r1(rect.left)}, ${r1(rect.top)}`],
      ['margin', sideText(sides(margin))],
      ['border', sides(border).map(r1).join(' ')],
      ['padding', sideText(sides(padding))],
      ['display', cs.display],
      ['gap', `${r1(px(cs.rowGap))} / ${r1(px(cs.columnGap))}`],
      ['font-family', cs.fontFamily],
      ['font used', renderedFont(cs)],
      ['font-size', fontSize],
      ['line-height', cs.lineHeight],
      ['font-weight', cs.fontWeight],
      ...offScaleFact(margin, padding, cs),
      ...positionedFact(node)
    ];
  }

  function measurementText(node) {
    if (!node || !node.isConnected) return '';
    const lines = [describe(node)];
    const entries = factsFor(node);
    const info = accessibility(node);
    entries.push(...info.facts, ...info.flags.map((flag) => ['issue', flag]));
    entries.forEach(([key, value]) => {
      lines.push(`${key.padEnd(8, ' ')}${value}`);
    });
    const cs = getComputedStyle(node);
    if (cs.display.includes('grid')) {
      lines.push(`${'cols'.padEnd(8, ' ')}${cs.gridTemplateColumns}`);
      lines.push(`${'rows'.padEnd(8, ' ')}${cs.gridTemplateRows}`);
      lines.push(`${'align'.padEnd(8, ' ')}${cs.alignItems} / ${cs.justifyItems}`);
    } else if (cs.display.includes('flex')) {
      lines.push(`${'flow'.padEnd(8, ' ')}${cs.flexDirection} ${cs.flexWrap}`);
      lines.push(`${'align'.padEnd(8, ' ')}${cs.alignItems} / ${cs.justifyContent}`);
    }
    return lines.join('\n');
  }

  function distanceText(a, b) {
    const overlapX = a.left < b.right && b.left < a.right;
    const overlapY = a.top < b.bottom && b.top < a.bottom;
    const parts = [];
    if (overlapX && overlapY) {
      parts.push(`left ${r1(b.left - a.left)}`, `right ${r1(b.right - a.right)}`);
      parts.push(`top ${r1(b.top - a.top)}`, `bottom ${r1(b.bottom - a.bottom)}`);
    } else {
      if (!overlapX) parts.push(`x ${r1(a.right <= b.left ? b.left - a.right : a.left - b.right)}`);
      if (!overlapY) parts.push(`y ${r1(a.bottom <= b.top ? b.top - a.bottom : a.top - b.bottom)}`);
    }
    return parts.join('  ');
  }

  function reportText() {
    const blocks = [];
    const hovered = state.hovered && state.hovered.isConnected ? state.hovered : null;

    if (hovered) blocks.push(`HOVERED\n${measurementText(hovered)}`);

    state.pins.forEach((pin, index) => {
      if (!pin.el.isConnected) return;
      const lines = [`FROZEN ${index + 1}`, measurementText(pin.el)];
      if (hovered && hovered !== pin.el) {
        const pinRect = pin.el.getBoundingClientRect();
        const hoveredRect = hovered.getBoundingClientRect();
        const deltaWidth = hoveredRect.width - pinRect.width;
        const deltaHeight = hoveredRect.height - pinRect.height;
        lines.push(`${'Δ size'.padEnd(8, ' ')}${deltaWidth >= 0 ? '+' : ''}${r1(deltaWidth)} × ${deltaHeight >= 0 ? '+' : ''}${r1(deltaHeight)}`);
        lines.push(`${'Δ gap'.padEnd(8, ' ')}${distanceText(pinRect, hoveredRect)}`);
      }
      blocks.push(lines.join('\n'));
    });

    measurements().forEach((measure) => {
      const lines = measureFacts(measure).map(([key, value]) => `${key.padEnd(8, ' ')}${value}`);
      blocks.push([`RULER ${measure.index}`, ...lines].join('\n'));
    });

    if (maps.overflow.items?.length) {
      blocks.push(['OVERFLOW', overflowSummary(), ...maps.overflow.items.map((item) => `${item.kind.padEnd(8, ' ')}${describe(item.node)} · ${item.label}`)].join('\n'));
    }
    if (maps.headings.items) {
      const warnings = outlineWarnings(maps.headings.items);
      if (warnings.length) blocks.push(['OUTLINE', ...warnings].join('\n'));
    }

    blocks.push(location.href);
    return blocks.join('\n\n');
  }

  function stamp(dataUrl) {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);

        const scale = window.devicePixelRatio || 1;
        const barHeight = Math.round(34 * scale);
        const padding = Math.round(14 * scale);
        context.fillStyle = 'rgba(11, 18, 32, .94)';
        context.fillRect(0, canvas.height - barHeight, canvas.width, barHeight);

        const baseline = canvas.height - barHeight / 2;
        context.textBaseline = 'middle';
        context.font = `${Math.round(14 * scale)}px Manrope, ui-sans-serif, system-ui, sans-serif`;

        const stampedAt = new Date().toLocaleString();
        context.fillStyle = '#94a3b8';
        context.textAlign = 'right';
        context.fillText(stampedAt, canvas.width - padding, baseline);

        const limit = canvas.width - padding * 3 - context.measureText(stampedAt).width;
        let url = location.href;
        context.textAlign = 'left';
        while (url.length > 12 && context.measureText(url).width > limit) {
          url = `${url.slice(0, -4)}…`;
        }
        context.fillStyle = '#f1f5f9';
        context.fillText(url, padding, baseline);

        resolve(canvas.toDataURL('image/png'));
      };
      image.onerror = () => resolve(dataUrl);
      image.src = dataUrl;
    });
  }

  function exportPng() {
    panelBody.classList.add('is-hidden');
    toastNode.classList.add('is-hidden');

    requestAnimationFrame(() => requestAnimationFrame(async () => {
      let dataUrl = null;
      try {
        const response = await chrome.runtime.sendMessage({ type: 'layout-ruler/capture' });
        dataUrl = response?.dataUrl || null;
      } catch (error) {
        dataUrl = null;
      }

      panelBody.classList.toggle('is-hidden', state.poppedOut);
      toastNode.classList.remove('is-hidden');

      if (!dataUrl) {
        toast('Export failed on this page');
        return;
      }

      const link = document.createElement('a');
      link.href = await stamp(dataUrl);
      link.download = `fe-inspector-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
      link.click();
      toast('PNG exported');
    }));
  }

  function placeToast() {
    if (!panelBody || state.poppedOut) {
      Object.assign(toastNode.style, { right: '16px', bottom: '16px' });
      return;
    }
    const rect = panelBody.getBoundingClientRect();
    const roomLeft = rect.left > 240;
    Object.assign(toastNode.style, roomLeft
      ? { right: `${innerWidth - rect.left + 12}px`, bottom: `${Math.max(innerHeight - rect.bottom, 8)}px` }
      : { right: `${Math.max(innerWidth - rect.right, 8)}px`, bottom: `${innerHeight - rect.top + 12}px` });
  }

  function toast(message) {
    if (!toastNode) return;
    placeToast();
    toastNode.textContent = message;
    toastNode.classList.add('toast--visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastNode.classList.remove('toast--visible'), 1600);
  }

  function legacyCopy(text) {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('aria-hidden', 'true');
    Object.assign(area.style, { position: 'fixed', top: '-1000px', opacity: '0' });
    document.body.append(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    return copied;
  }

  function copy(text, message) {
    if (!text) {
      toast('Nothing to copy');
      return;
    }
    const done = () => toast(message);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => {
        toast(legacyCopy(text) ? message : 'Copy blocked by the page');
      });
      return;
    }
    toast(legacyCopy(text) ? message : 'Copy blocked by the page');
  }

  /* ---------- snapshot & render ---------- */

  function snapshot(a11y) {
    const hovered = state.hovered && state.hovered.isConnected ? state.hovered : null;
    const hoveredRect = hovered ? hovered.getBoundingClientRect() : null;
    const signed = (value) => `${value >= 0 ? '+' : ''}${r1(value)}`;
    const info = a11y !== undefined ? a11y : hovered ? accessibility(hovered) : null;
    const preset = state.showGrid ? activePreset() : null;
    const outline = state.showHeadings ? maps.headings.items : null;
    const overflow = state.showOverflow ? maps.overflow.items : null;
    const indexed = (items, kind) => (items || []).map((item, index) => ({ ...item, index })).filter((item) => item.kind === kind);

    return {
      viewport: `${viewportText()}${preset ? ` · ${preset.name}` : ''}`,
      child: state.claimed,
      toggles: {
        layout: state.showLayout,
        ruler: state.ruler.enabled,
        'grid-ruler': state.showGridRuler,
        'layout-grid': state.showGrid,
        design: state.showDesign,
        headings: state.showHeadings,
        'focus-map': state.showFocusMap,
        overflow: state.showOverflow,
        spacing: state.showSpacing,
        layers: state.showLayers,
        viewport: state.showViewport,
        'safe-areas': state.showSafeAreas,
        sections: state.showSections,
        'copy-on-click': state.copyOnClick
      },
      hovered: hovered ? {
        name: describe(hovered),
        classes: classNames(hovered),
        facts: factsFor(hovered),
        a11y: info?.facts || null,
        flags: info?.flags || [],
        frame: isFrame(hovered)
      } : null,
      layers: state.showLayers && hovered ? layerSlice(hovered) : null,
      sections: state.showSections ? sectionSlice() : null,
      viewportSizes: state.showViewport ? { width: innerWidth, height: innerHeight, custom: state.viewportSize } : null,
      overflow: state.showOverflow ? {
        summary: overflowSummary(),
        scanning: !overflow,
        items: indexed(overflow, 'overflow').concat(indexed(overflow, 'clips'))
          .map((item) => ({ index: item.index, kind: item.kind, name: describe(item.node), label: item.label }))
      } : null,
      outline: state.showHeadings ? {
        warnings: outline ? outlineWarnings(outline) : [],
        headings: indexed(outline, 'heading').map(({ index, level, text }) => ({ index, level, text })),
        landmarks: indexed(outline, 'landmark').map(({ index, role, name }) => ({ index, role, name }))
      } : null,
      grid: preset ? { preset: { ...preset }, origin: location.host } : null,
      design: state.showDesign ? { ...state.design, drag: state.designDrag, key: designKey() } : null,
      spacing: state.showSpacing ? { base: state.spacingBase, rootFontSize: rootFontSize() } : null,
      measures: measurements().map((measure) => ({ index: measure.index, facts: measureFacts(measure) })),
      pins: state.pins.map((pin) => {
        const rect = pin.el.getBoundingClientRect();
        return {
          name: describe(pin.el),
          classes: classNames(pin.el),
          color: pin.color,
          size: `${r1(rect.width)} × ${r1(rect.height)}`,
          delta: hoveredRect && state.hovered !== pin.el
            ? `Δ ${signed(hoveredRect.width - rect.width)} × ${signed(hoveredRect.height - rect.height)}`
            : ''
        };
      })
    };
  }

  function signature() {
    const parts = [
      state.ruler.enabled,
      state.pins.length,
      innerWidth,
      innerHeight,
      scrollX,
      scrollY,
      measurements().map(({ from, to }) => `${from.x}:${from.y}:${to.x}:${to.y}`).join(',') || '-'
    ];
    const push = (node) => {
      if (!node || !node.isConnected) {
        parts.push('-');
        return;
      }
      const rect = node.getBoundingClientRect();
      parts.push(`${describe(node)}:${r1(rect.left)}:${r1(rect.top)}:${r1(rect.width)}:${r1(rect.height)}`);
    };
    push(state.hovered);
    state.pins.forEach((pin) => push(pin.el));
    return parts.join('|');
  }

  function render() {
    Object.values(layers).forEach(clear);
    drawGridRuler();
    drawLayoutGrid();
    drawSafeAreas();
    drawSections();
    drawPins();

    const hovered = state.hovered && state.hovered.isConnected ? state.hovered : null;
    if (hovered) {
      drawBoxModel(hovered);
      spacingLabels(hovered);
      if (state.showLayout) {
        drawLayout(hovered);
        if (!state.showLayers) drawPositioned(hovered);
      }
      if (state.showLayers) drawLayers(hovered);
    }

    if (state.showLayout && hovered) {
      const hoveredRect = hovered.getBoundingClientRect();
      state.pins.forEach((pin) => {
        if (pin.el === hovered || !pin.el.isConnected) return;
        drawDistance(pin.el.getBoundingClientRect(), hoveredRect, pin.color);
      });
    }

    drawRuler();
    refreshMaps(true);
    placeDesign();

    const info = hovered ? accessibility(hovered) : null;
    if (hovered) drawTip(hovered, info);
    const snap = snapshot(info);
    if (!state.poppedOut) Panel.render(panelBody, snap, { mode: 'page', level: 2 });
    pushState(snap);
  }

  function tick() {
    if (!state.active) return;
    const next = signature();
    if (next !== lastSignature) {
      lastSignature = next;
      render();
    } else refreshMaps(false);
    rafId = requestAnimationFrame(tick);
  }

  function invalidate() {
    lastSignature = '';
  }

  /* ---------- events ---------- */

  function onPointerMove(event) {
    if (!state.active || state.locked) return;
    const path = event.composedPath();
    if (path.includes(host) && !path.includes(captureNode)) return;
    const target = topElementAt(event.clientX, event.clientY);
    if (!target) return;
    if (target !== state.hovered) {
      state.hovered = target;
      invalidate();
    }
  }

  function onPageClick(event) {
    if (!state.active || !state.copyOnClick || state.showGridRuler || event.button !== 0 || event.composedPath().includes(host) || event.composedPath().includes(designHost)) return;
    event.preventDefault();
    event.stopPropagation();
    if (state.locked) {
      state.locked = false;
      state.hovered = topElementAt(event.clientX, event.clientY) || state.hovered;
      invalidate();
      return;
    }
    const names = classNames(state.hovered);
    if (!names.length) {
      toast('No class on this element');
      return;
    }
    const selector = names.map((name) => `.${name}`).join('');
    copy(selector, `${selector} copied`);
  }

  function togglePin(node) {
    if (!node) return;
    const index = state.pins.findIndex((pin) => pin.el === node);
    if (index >= 0) state.pins.splice(index, 1);
    else state.pins.push({ el: node, color: PIN_COLORS[state.pins.length % PIN_COLORS.length] });
    invalidate();
  }

  function placePanel(left, top) {
    const rect = panelBody.getBoundingClientRect();
    const limit = (value, max) => Math.max(8, Math.min(value, Math.max(8, max)));
    Object.assign(panelBody.style, {
      left: `${limit(left, innerWidth - rect.width - 8)}px`,
      top: `${limit(top, innerHeight - rect.height - 8)}px`,
      right: 'auto',
      bottom: 'auto'
    });
  }

  function onPanelDown(event) {
    if (event.button !== 0 || !event.target.closest('.panel__head') || event.target.closest('button')) return;
    const rect = panelBody.getBoundingClientRect();
    drag.active = true;
    drag.offsetX = event.clientX - rect.left;
    drag.offsetY = event.clientY - rect.top;
    panelBody.classList.add('panel--dragging');
    placePanel(rect.left, rect.top);
    event.preventDefault();
  }

  function onPanelMove(event) {
    if (!drag.active) return;
    placePanel(event.clientX - drag.offsetX, event.clientY - drag.offsetY);
    event.preventDefault();
  }

  function onPanelUp() {
    if (!drag.active) return;
    drag.active = false;
    panelBody.classList.remove('panel--dragging');
  }

  /* ---------- iframe hand-off ---------- */

  const claims = { posted: new Map(), broadcast: new Map() };

  function tryClaim(token) {
    if (!claims.posted.has(token) || !claims.broadcast.has(token)) return;
    const parentFrameId = claims.broadcast.get(token);
    claims.posted.delete(token);
    claims.broadcast.delete(token);
    state.claimed = true;
    activate();
    send({ type: 'layout-ruler/claimed', parentFrameId });
  }

  function noteClaim(store, token, value) {
    store.set(token, value);
    setTimeout(() => store.delete(token), 5000);
    tryClaim(token);
  }

  window.addEventListener('message', (event) => {
    if (window.parent === window || event.source !== window.parent) return;
    const token = event.data?.layoutRulerToken;
    if (typeof token === 'string') noteClaim(claims.posted, token, true);
  });

  async function enterFrame() {
    const frame = state.hovered;
    if (!isFrame(frame) || !frame.contentWindow) {
      toast('Hover an iframe first');
      return;
    }
    const token = crypto.randomUUID();
    try {
      await chrome.runtime.sendMessage({ type: 'layout-ruler/prepare-frames' });
      frame.contentWindow.postMessage({ layoutRulerToken: token }, '*');
      send({ type: 'layout-ruler/claim', token });
      setTimeout(() => {
        if (state.active) toast('This iframe can’t be inspected');
      }, 1500);
    } catch (error) {
      toast('This iframe can’t be inspected');
    }
  }

  function exitFrame() {
    state.claimed = false;
    deactivate();
    send({ type: 'layout-ruler/exit-frame' });
  }

  function close() {
    const child = state.claimed;
    state.claimed = false;
    deactivate();
    if (child || window.top === window) send({ type: 'layout-ruler/closed' });
  }

  function escape() {
    if (state.locked) state.locked = false;
    else if (state.ruler.enabled) setRulerEnabled(false);
    else if (state.claimed) exitFrame();
    else close();
  }

  /* ---------- actions ---------- */

  function reveal(index, kind) {
    const node = kind === 'layer'
      ? state.layerItems?.[index]
      : kind === 'section'
      ? state.sectionItems?.[index]
      : (kind === 'overflow' ? maps.overflow : maps.headings).items?.[index]?.node;
    if (!node?.isConnected) return;
    node.scrollIntoView({ block: 'center', inline: 'nearest' });
    lockOn(node);
  }

  async function resizeViewport(width, height) {
    if (!(width >= 200 && height >= 200)) return;
    state.viewportSize = { width, height };
    toast(`Resizing to ${width} × ${height}…`);
    const response = await chrome.runtime.sendMessage({ type: 'layout-ruler/viewport', width, height }).catch((error) => ({ error: String(error) }));
    if (response?.error) toast('Could not resize the window');
  }

  async function restoreViewport() {
    await chrome.runtime.sendMessage({ type: 'layout-ruler/viewport', restore: true }).catch(() => {});
  }

  function setField(field, value) {
    const [group, key] = String(field).split('.');
    if (group === 'viewport' && (key === 'width' || key === 'height')) {
      const next = { ...state.viewportSize, [key]: value };
      resizeViewport(next.width, next.height);
      return;
    }
    if (group === 'grid') setGridField(key, value);
    else if (group === 'design') setDesignField(key, value);
    else if (group === 'spacing' && key === 'base' && value > 0) {
      state.spacingBase = value;
      saveSettings();
    }
  }

  function toggle(action) {
    const key = TOGGLES[action];
    if (action === 'focus-map') toggleFocusMap();
    else state[key] = !state[key];
    if (action === 'copy-on-click') toast(state.copyOnClick ? 'Click copies the class' : 'Clicks reach the page');
    if (action === 'design' && state.showDesign) loadDesign();
    if (action === 'overflow' && state.showOverflow) toast('Scanning for overflow…');
    saveSettings();
  }

  function runAction(action, index, value) {
    if (TOGGLES[action]) toggle(action);
    else if (action === 'close') close();
    else if (action === 'escape') escape();
    else if (action === 'enter-frame') enterFrame();
    else if (action === 'exit-frame') exitFrame();
    else if (action === 'freeze') togglePin(state.hovered);
    else if (action === 'ruler') setRulerEnabled(!state.ruler.enabled);
    else if (action === 'unpin') state.pins.splice(Number(index), 1);
    else if (action === 'unmeasure') state.ruler.measures.splice(Number(index), 1);
    else if (action === 'clear-measures') clearMeasures();
    else if (action === 'clear') state.pins = [];
    else if (action === 'clear-all') {
      state.pins = [];
      clearMeasures();
    } else if (action === 'copy-element') copy(measurementText(state.hovered), 'Element copied');
    else if (action === 'copy-report') copy(reportText(), 'Report copied');
    else if (action === 'copy-class') copy(value, `${value} copied`);
    else if (action === 'export') exportPng();
    else if (action === 'popout') setPoppedOut(true);
    else if (action === 'popin') setPoppedOut(false);
    else if (action === 'reveal') reveal(Number(index), value);
    else if (action === 'set') setField(index, value);
    else if (action === 'viewport-size') {
      const [width, height] = String(value).split('x').map(Number);
      resizeViewport(width, height);
    } else if (action === 'viewport-restore') restoreViewport();
    else if (action === 'grid-reset') {
      state.presets = DEFAULT_PRESETS.map((preset) => ({ ...preset }));
      chrome.storage.local.remove(gridKey()).catch(() => {});
    } else if (action === 'design-scroll' || action === 'design-blend') {
      const key = action === 'design-scroll' ? 'scroll' : 'blend';
      state.design[key] = !state.design[key];
      placeDesign();
      saveDesignSettings();
    } else if (action === 'design-drag') {
      state.designDrag = !state.designDrag;
      placeDesign();
    } else if (action === 'design-remove') removeDesign();
    else if (action === 'design-reload') loadDesign();
    else if (action === 'design-file') useDesignFile(value);
    invalidate();
  }

  function dispatchLocal(action, index, value) {
    runAction(action, index, value);
  }

  function setPoppedOut(poppedOut) {
    state.poppedOut = poppedOut;
    panelBody.classList.toggle('is-hidden', poppedOut);
    send({ type: poppedOut ? 'layout-ruler/popout' : 'layout-ruler/popout-close' });
    if (!poppedOut) {
      panelBody.layoutRulerSignatures = {};
    }
    invalidate();
  }

  function send(message) {
    try {
      chrome.runtime.sendMessage(message)?.catch?.(() => {});
    } catch (error) {
      /* the tab outlived its extension context */
    }
  }

  function flushState() {
    clearTimeout(pushTimer);
    pushTimer = 0;
    lastPush = performance.now();
    if (pendingSnapshot) send({ type: 'layout-ruler/state', payload: pendingSnapshot });
  }

  function pushState(snap, force) {
    if (!state.poppedOut) return;
    pendingSnapshot = snap;
    const wait = 60 - (performance.now() - lastPush);
    if (force || wait <= 0) flushState();
    else if (!pushTimer) pushTimer = setTimeout(flushState, wait);
  }

  function onKeyDown(event) {
    if (!state.active) return;
    const action = Panel.keyAction(event);
    if (!action) return;
    if (action === 'enter-frame' && !isFrame(state.hovered)) return;
    runAction(action);
    event.preventDefault();
    event.stopPropagation();
  }

  function onViewportChange() {
    if (panelBody?.style.left) {
      const rect = panelBody.getBoundingClientRect();
      placePanel(rect.left, rect.top);
    }
    invalidate();
  }

  async function activate(fresh = false) {
    if (state.active) return;
    state.active = true;
    building ||= build();
    await Promise.all([building, settingsReady, loadPresets(), loadToggles(fresh)]);
    if (!state.active) return;
    if (!host.isConnected) document.documentElement.append(designHost, host);
    host.hidden = false;
    designHost.hidden = false;
    if (state.showDesign) loadDesign();
    cancelAnimationFrame(rafId);
    document.addEventListener('mousemove', onPointerMove, true);
    document.addEventListener('mouseover', onPointerMove, true);
    window.addEventListener('mousemove', onRulerMove, true);
    window.addEventListener('mouseup', onRulerUp, true);
    window.addEventListener('mousemove', onPanelMove, true);
    window.addEventListener('mouseup', onPanelUp, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('click', onPageClick, true);
    window.addEventListener('scroll', onViewportChange, true);
    window.addEventListener('resize', onViewportChange, true);
    invalidate();
    tick();
  }

  function deactivate() {
    if (!state.active) return;
    state.active = false;
    state.hovered = null;
    state.locked = false;
    if (!host) return;
    setRulerEnabled(false);
    if (state.poppedOut) setPoppedOut(false);
    cancelAnimationFrame(rafId);
    document.removeEventListener('mousemove', onPointerMove, true);
    document.removeEventListener('mouseover', onPointerMove, true);
    window.removeEventListener('mousemove', onRulerMove, true);
    window.removeEventListener('mouseup', onRulerUp, true);
    window.removeEventListener('mousemove', onPanelMove, true);
    window.removeEventListener('mouseup', onPanelUp, true);
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('click', onPageClick, true);
    window.removeEventListener('scroll', onViewportChange, true);
    window.removeEventListener('resize', onViewportChange, true);
    Object.values(maps).forEach((map) => {
      map.items = null;
      map.content = null;
      map.geometry = '';
    });
    placeDesign();
    host.hidden = true;
    designHost.hidden = true;
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const type = message?.type;
    if (type === 'layout-ruler/toggle') {
      if (state.active) close();
      else activate(true);
      sendResponse({ active: state.active });
      return false;
    }
    if (type === 'layout-ruler/command') {
      const { action, index, value, remote } = message;
      if (action === 'ping') pushState(snapshot(), true);
      else if (remote && action === 'copy-element') send({ type: 'layout-ruler/clip', text: measurementText(state.hovered), label: 'Element copied' });
      else if (remote && action === 'copy-report') send({ type: 'layout-ruler/clip', text: reportText(), label: 'Report copied' });
      else if (remote && action === 'copy-class') send({ type: 'layout-ruler/clip', text: value, label: `${value} copied` });
      else if (action === 'enter-frame' && !isFrame(state.hovered)) toast('Hover an iframe first');
      else runAction(action, index, value);
    }
    if (type === 'layout-ruler/popin' && panelBody) {
      state.poppedOut = false;
      panelBody.classList.remove('is-hidden');
      panelBody.layoutRulerSignatures = {};
      invalidate();
    }
    if (type === 'layout-ruler/claim' && typeof message.token === 'string') {
      noteClaim(claims.broadcast, message.token, message.parentFrameId);
    }
    if (type === 'layout-ruler/suspend') deactivate();
    if (type === 'layout-ruler/resume') activate();
    return false;
  });

  window.__layoutRuler = { activate, deactivate, state, alive: () => Boolean(chrome.runtime?.id) };

  if (window.top === window) {
    chrome.runtime.sendMessage({ type: 'layout-ruler/restore' })
      .then((response) => {
        if (response?.active) activate();
      })
      .catch(() => {});
  }
})();
