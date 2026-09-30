(() => {
  if (window.__layoutRuler) return;

  const PIN_COLORS = ['#0ea5e9', '#7c3aed', '#059669', '#d97706', '#2563eb', '#db2777'];
  const SNAP = 6;
  const px = (value) => parseFloat(value) || 0;
  const r1 = (value) => Math.round(value * 10) / 10;

  const state = {
    active: false,
    hovered: null,
    pins: [],
    showLayout: true,
    showDistances: true,
    showContrast: true,
    copyOnClick: true,
    ruler: { enabled: false, dragging: false, from: null, to: null, measures: [] },
    poppedOut: false
  };

  let host = null;
  let root = null;
  let panelBody = null;
  let toastNode = null;
  let captureNode = null;
  const drag = { active: false, offsetX: 0, offsetY: 0 };
  let toastTimer = 0;
  let rafId = 0;
  let lastSignature = '';
  let lastPush = 0;
  const layers = {};

  const ICONS = {
    close: 'M6 18 18 6M6 6l12 12',
    copy: 'M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184',
    ruler: 'M7.5 21 3 16.5m0 0L7.5 12m-4.5 4.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5',
    popout: 'M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25',
    download: 'M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3',
    trash: 'm14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.2v.916m7.5 0a48.667 48.667 0 0 0-7.5 0'
  };

  const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Dongle&family=Elms+Sans:ital,wght@0,100..900;1,100..900&family=Manrope:wght@200..800&display=swap';
  const FONT_STACK = `'Manrope', 'Elms Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif`;

  const STYLE = `
    :host {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      pointer-events: none;
      color-scheme: dark;
    }
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
    .box--margin { background: rgba(251, 191, 36, .22); }
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
    .tip__row { color: #cbd5e1; }
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
    .track--gap {
      border-style: none;
      background: rgba(217, 70, 239, .22);
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
    .track--item {
      border: 1px dashed rgba(16, 185, 129, .8);
      background: rgba(16, 185, 129, .05);
    }
    .panel {
      position: fixed;
      right: 16px;
      bottom: 16px;
      display: grid;
      gap: 12px;
      align-content: start;
      width: 360px;
      max-height: 74vh;
      padding: 16px;
      overflow: auto;
      border-radius: 14px;
      background: #0b1220;
      color: #e2e8f0;
      font: 400 14px/1.5 ${FONT_STACK};
      box-shadow: 0 0 0 1px rgba(148, 163, 184, .14), 0 18px 40px rgba(2, 6, 23, .5);
      pointer-events: auto;
    }
    .panel__head {
      cursor: grab;
      user-select: none;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      align-items: center;
      gap: 2px;
    }
    .panel__title {
      display: flex;
      align-items: center;
      gap: 7px;
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: -.01em;
      color: #f1f5f9;
    }
    .panel--dragging, .panel--dragging .panel__head { cursor: grabbing; }
    .panel__dot {
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: #ed1941;
    }
    .panel__close {
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: #94a3b8;
      cursor: pointer;
    }
    .panel__close:hover { background: #16223a; color: #f1f5f9; }
    .panel__row { display: flex; flex-wrap: wrap; gap: 6px; }
    .panel__section { display: grid; gap: 7px; }
    .panel__label {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: .02em;
      color: #94a3b8;
    }
    .panel__empty { margin: 0; color: #94a3b8; }
    .panel__divider { height: 1px; background: rgba(148, 163, 184, .14); }
    .icon {
      width: 16px;
      height: 16px;
      flex: none;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 11px;
      border: 1px solid rgba(148, 163, 184, .22);
      border-radius: 9px;
      background: transparent;
      color: #cbd5e1;
      font: 500 14px/1.4 ${FONT_STACK};
      cursor: pointer;
      transition: background-color .12s ease, border-color .12s ease, color .12s ease;
    }
    .btn:hover { background: #16223a; color: #f1f5f9; }
    .btn[aria-pressed="true"] {
      border-color: rgba(237, 25, 65, .55);
      background: rgba(237, 25, 65, .14);
      color: #f87a90;
    }
    .btn--primary {
      border-color: #ed1941;
      background: #ed1941;
      color: #ffffff;
    }
    .btn--primary:hover { background: #f43f5e; border-color: #f43f5e; color: #ffffff; }
    .name {
      display: block;
      margin: 0;
      color: #f87a90;
      font-size: 14px;
      word-break: break-all;
    }
    .facts {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 3px 14px;
      margin: 0;
      font-size: 14px;
      font-variant-numeric: tabular-nums;
    }
    .facts__key { color: #94a3b8; }
    .facts__value { margin: 0; color: #e2e8f0; word-break: break-all; }
    .classes {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .classes__copy {
      min-height: 24px;
      padding: 1px 8px;
      border: 1px solid rgba(248, 122, 144, .35);
      border-radius: 6px;
      background: transparent;
      color: #f87a90;
      font: 500 14px/1.4 ${FONT_STACK};
      word-break: break-all;
      cursor: copy;
    }
    .classes__copy:hover { background: rgba(237, 25, 65, .14); color: #f1f5f9; }
    .pins { display: grid; gap: 7px; margin: 0; padding: 0; list-style: none; }
    .pins__item {
      display: grid;
      grid-template-columns: 8px minmax(0, 1fr) auto;
      align-items: start;
      gap: 10px;
      padding: 9px 10px;
      border: 1px solid rgba(148, 163, 184, .14);
      border-radius: 10px;
      background: #101a2d;
    }
    .pins__swatch {
      width: 8px;
      height: 8px;
      margin-top: 7px;
      border-radius: 999px;
      background: currentColor;
    }
    .pins__meta {
      margin: 0;
      color: #cbd5e1;
      font-size: 14px;
      font-variant-numeric: tabular-nums;
    }
    .pins__delta { color: #fcd34d; }
    .pins__remove {
      display: grid;
      place-items: center;
      width: 24px;
      height: 24px;
      border: 0;
      border-radius: 7px;
      background: transparent;
      color: #94a3b8;
      cursor: pointer;
    }
    .pins__remove:hover { background: #16223a; color: #f1f5f9; }
    .keys {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto minmax(0, 1fr);
      align-items: center;
      gap: 5px 10px;
      margin: 0;
      font-size: 14px;
      color: #94a3b8;
    }
    .keys__key {
      justify-self: start;
      padding: 1px 7px;
      border: 1px solid rgba(148, 163, 184, .22);
      border-radius: 6px;
      background: #101a2d;
      color: #cbd5e1;
      font-size: 14px;
    }
    .keys__value { margin: 0; }
    .toast {
      position: fixed;
      right: 392px;
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
    .is-hidden { display: none; }
    @media (prefers-reduced-motion: reduce) {
      .btn, .toast { transition: none; }
    }
    button:focus-visible {
      outline: 2px solid #f87a90;
      outline-offset: 2px;
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

  function icon(path) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.5');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    shape.setAttribute('stroke-linecap', 'round');
    shape.setAttribute('stroke-linejoin', 'round');
    shape.setAttribute('d', path);
    svg.append(shape);
    return svg;
  }

  function build() {
    loadFonts();

    host = el('div');
    host.id = 'layout-ruler-host';
    root = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = STYLE;
    root.append(style);

    ['pins', 'box', 'layout', 'distance', 'measure', 'labels'].forEach((name) => {
      layers[name] = el('div', 'layer');
      root.append(layers[name]);
    });

    captureNode = el('div', 'capture');
    captureNode.addEventListener('mousedown', onRulerDown);
    root.append(captureNode);

    panelBody = el('aside', 'panel');
    panelBody.setAttribute('aria-label', 'Layout Ruler');
    panelBody.addEventListener('click', onPanelClick);
    panelBody.addEventListener('mousedown', onPanelDown);
    root.append(panelBody);

    toastNode = el('output', 'toast');
    toastNode.setAttribute('aria-live', 'polite');
    root.append(toastNode);

    document.documentElement.append(host);
  }

  function topElementAt(x, y) {
    return document.elementsFromPoint(x, y).find((node) => node !== host && node !== document.documentElement) || null;
  }

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
    const start = snapPoint(event.clientX, event.clientY, { x: event.clientX, y: event.clientY }, false);
    state.ruler.from = start;
    state.ruler.to = start;
    state.ruler.dragging = true;
    invalidate();
  }

  function onRulerMove(event) {
    if (!state.ruler.dragging) return;
    state.ruler.to = snapPoint(event.clientX, event.clientY, state.ruler.from, event.shiftKey);
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
    return { from, to, dx, dy, length: Math.hypot(dx, dy), index };
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

  function classButtons(node) {
    const names = classNames(node);
    if (!names.length) return null;
    const list = el('ul', 'classes');
    list.setAttribute('aria-label', 'Classes');
    names.forEach((name) => {
      const item = el('li');
      item.append(button('classes__copy', 'copy-class', `.${name}`, { value: `.${name}`, ariaLabel: `Copy class .${name}` }));
      list.append(item);
    });
    return list;
  }

  function place(node, box) {
    Object.assign(node.style, {
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${Math.max(box.width, 0)}px`,
      height: `${Math.max(box.height, 0)}px`
    });
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
    [
      [margin.top, rect.left + rect.width / 2, rect.top - margin.top / 2, 'm'],
      [margin.bottom, rect.left + rect.width / 2, rect.bottom + margin.bottom / 2, 'm'],
      [margin.left, rect.left - margin.left / 2, rect.top + rect.height / 2, 'm'],
      [margin.right, rect.right + margin.right / 2, rect.top + rect.height / 2, 'm'],
      [padding.top, rect.left + rect.width / 2, rect.top + padding.top / 2, 'p'],
      [padding.bottom, rect.left + rect.width / 2, rect.bottom - padding.bottom / 2, 'p'],
      [padding.left, rect.left + padding.left / 2, rect.top + rect.height / 2, 'p'],
      [padding.right, rect.right - padding.right / 2, rect.top + rect.height / 2, 'p']
    ].forEach(([value, x, y, kind]) => {
      if (value < 4) return;
      chip(`${kind}${r1(value)}`, x, y, '', { transform: 'translate(-50%, -50%)' });
    });
  }

  function layoutSummary(cs) {
    const lines = [`display: ${cs.display}`];
    if (cs.position !== 'static') lines.push(`position: ${cs.position}`);
    if (cs.display.includes('grid')) {
      lines.push(`cols: ${cs.gridTemplateColumns}`);
      lines.push(`rows: ${cs.gridTemplateRows}`);
      lines.push(`gap: ${r1(px(cs.rowGap))} / ${r1(px(cs.columnGap))}`);
      lines.push(`align: ${cs.alignItems} · justify: ${cs.justifyItems}`);
    } else if (cs.display.includes('flex')) {
      lines.push(`flex-flow: ${cs.flexDirection} ${cs.flexWrap}`);
      lines.push(`gap: ${r1(px(cs.rowGap))} / ${r1(px(cs.columnGap))}`);
      lines.push(`justify: ${cs.justifyContent} · align: ${cs.alignItems}`);
    }
    lines.push(`font: ${cs.fontSize}/${cs.lineHeight} ${cs.fontWeight}`);
    lines.push(`color: ${cs.color}`);
    return lines;
  }

  function drawTip(node) {
    const { rect, cs } = metrics(node);
    const tip = el('div', 'tip');

    const name = el('span', 'tip__name');
    name.textContent = describe(node);
    const size = el('span', 'tip__size');
    size.textContent = `${r1(rect.width)} × ${r1(rect.height)}`;
    tip.append(name, size);

    layoutSummary(cs).forEach((line) => {
      const row = el('span', 'tip__row');
      row.textContent = line;
      tip.append(row);
    });

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

  function tracks(value) {
    if (!value || value === 'none') return [];
    return value.split(' ').map(parseFloat).filter((n) => !Number.isNaN(n));
  }

  function addTrack(box, modifier, label) {
    const node = el('div', `track${modifier ? ` track--${modifier}` : ''}`);
    place(node, box);
    layers.layout.append(node);
    if (label) {
      chip(label, box.left + box.width / 2, box.top + box.height / 2, 'track', { transform: 'translate(-50%, -50%)' });
    }
  }

  function drawGrid(node, cs) {
    const { rect, border, padding } = metrics(node);
    const cols = tracks(cs.gridTemplateColumns);
    const rows = tracks(cs.gridTemplateRows);
    if (!cols.length && !rows.length) return;

    const columnGap = px(cs.columnGap);
    const rowGap = px(cs.rowGap);
    const originX = rect.left + border.left + padding.left;
    const originY = rect.top + border.top + padding.top;
    const gridWidth = cols.reduce((sum, n) => sum + n, 0) + Math.max(cols.length - 1, 0) * columnGap;
    const gridHeight = rows.reduce((sum, n) => sum + n, 0) + Math.max(rows.length - 1, 0) * rowGap;

    let x = originX;
    cols.forEach((width, index) => {
      addTrack({ left: x, top: originY, width, height: gridHeight }, '', `${r1(width)}`);
      x += width;
      if (index < cols.length - 1 && columnGap > 0) {
        addTrack({ left: x, top: originY, width: columnGap, height: gridHeight }, 'gap', columnGap >= 16 ? `${r1(columnGap)}` : '');
        x += columnGap;
      }
    });

    let y = originY;
    rows.forEach((height, index) => {
      addTrack({ left: originX, top: y, width: gridWidth, height }, '', '');
      chip(`${r1(height)}`, originX - 4, y + height / 2, 'track', { transform: 'translate(-100%, -50%)' });
      y += height;
      if (index < rows.length - 1 && rowGap > 0) {
        addTrack({ left: originX, top: y, width: gridWidth, height: rowGap }, 'gap', rowGap >= 16 ? `${r1(rowGap)}` : '');
        y += rowGap;
      }
    });
  }

  function drawFlex(node, cs) {
    const rects = [...node.children]
      .filter((child) => getComputedStyle(child).display !== 'none')
      .map((child) => child.getBoundingClientRect());
    rects.forEach((rect) => addTrack(rect, 'item', ''));

    const horizontal = cs.flexDirection.startsWith('row');
    const sorted = rects.slice().sort((a, b) => (horizontal ? a.left - b.left : a.top - b.top));

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
        }, 'gap', `${r1(gap)}`);
      } else {
        const gap = current.top - previous.bottom;
        if (gap < 0.5) continue;
        const left = Math.max(previous.left, current.left);
        addTrack({
          left,
          top: previous.bottom,
          width: Math.max(Math.min(previous.right, current.right) - left, 2),
          height: gap
        }, 'gap', `${r1(gap)}`);
      }
    }
  }

  function drawLayout(node) {
    const cs = getComputedStyle(node);
    if (cs.display.includes('grid')) drawGrid(node, cs);
    else if (cs.display.includes('flex')) drawFlex(node, cs);
  }

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

  function backdrop(node) {
    const found = [];
    let image = false;
    for (let current = node; current; current = current.parentElement) {
      const cs = getComputedStyle(current);
      if (cs.backgroundImage !== 'none') image = true;
      const color = rgba(cs.backgroundColor);
      if (color[3] > 0) found.push(color);
      if (color[3] === 1) break;
    }
    const color = found.reduceRight((under, layer) => over(layer, under), [255, 255, 255, 1]);
    return { color, image };
  }

  function channel(value) {
    const scaled = value / 255;
    return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  }

  function luminance([r, g, b]) {
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  }

  function toHex(color) {
    return `#${color.slice(0, 3).map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`;
  }

  function contrastFacts(node) {
    const isControl = /^(INPUT|BUTTON|TEXTAREA|SELECT)$/.test(node.tagName);
    const hasText = [...node.childNodes].some((child) => child.nodeType === 3 && child.nodeValue.trim());
    if (!hasText && !isControl) return [];

    const cs = getComputedStyle(node);
    const { color: background, image } = backdrop(node);
    const ink = over(rgba(cs.color), background);
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
    if (image) notes.push('over an image, verify');

    return [['text', toHex(ink)], ['background', toHex(background)], ['contrast', notes.join(' · ')]];
  }

  function factsFor(node) {
    const { rect, cs, margin, padding, border } = metrics(node);
    return [
      ['size', `${r1(rect.width)} × ${r1(rect.height)}`],
      ['offset', `${r1(rect.left)}, ${r1(rect.top)}`],
      ['margin', `${r1(margin.top)} ${r1(margin.right)} ${r1(margin.bottom)} ${r1(margin.left)}`],
      ['border', `${r1(border.top)} ${r1(border.right)} ${r1(border.bottom)} ${r1(border.left)}`],
      ['padding', `${r1(padding.top)} ${r1(padding.right)} ${r1(padding.bottom)} ${r1(padding.left)}`],
      ['display', cs.display],
      ['gap', `${r1(px(cs.rowGap))} / ${r1(px(cs.columnGap))}`],
      ['font', `${cs.fontSize} / ${cs.lineHeight}`],
      ...(state.showContrast ? contrastFacts(node) : [])
    ];
  }

  function measurementText(node) {
    if (!node || !node.isConnected) return '';
    const lines = [describe(node)];
    factsFor(node).forEach(([key, value]) => {
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

        const scale = image.naturalWidth / Math.max(innerWidth, 1);
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

      panelBody.classList.remove('is-hidden');
      toastNode.classList.remove('is-hidden');

      if (!dataUrl) {
        toast('Export failed on this page');
        return;
      }

      const link = document.createElement('a');
      link.href = await stamp(dataUrl);
      link.download = `layout-ruler-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
      link.click();
      toast('PNG exported');
    }));
  }

  function toast(message) {
    if (!toastNode) return;
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

  function button(className, action, label, options = {}) {
    const node = el('button', className);
    node.type = 'button';
    node.dataset.action = action;
    if (options.index !== undefined) node.dataset.index = String(options.index);
    if (options.value !== undefined) node.dataset.value = options.value;
    if (options.pressed !== undefined) node.setAttribute('aria-pressed', String(options.pressed));
    if (options.ariaLabel) node.setAttribute('aria-label', options.ariaLabel);
    if (options.icon) node.append(icon(options.icon));
    if (label) node.append(label);
    return node;
  }

  function renderPanel() {
    clear(panelBody);

    const head = el('header', 'panel__head');
    const title = el('h2', 'panel__title');
    title.append(el('span', 'panel__dot'), 'Layout Ruler');
    head.append(
      title,
      button('panel__close', 'popout', '', { icon: ICONS.popout, ariaLabel: 'Move the panel to its own window' }),
      button('panel__close', 'close', '', { icon: ICONS.close, ariaLabel: 'Close the layout inspector' })
    );

    const toggles = el('div', 'panel__row');
    toggles.append(
      button('btn', 'layout', 'grid / flex', { pressed: state.showLayout }),
      button('btn', 'distances', 'distances', { pressed: state.showDistances }),
      button('btn', 'contrast', 'contrast', { pressed: state.showContrast }),
      button('btn', 'ruler', 'ruler', { icon: ICONS.ruler, pressed: state.ruler.enabled }),
      button('btn', 'copy-on-click', 'click copies class', { pressed: state.copyOnClick })
    );

    const hoverSection = el('section', 'panel__section');
    const hoverLabel = el('h3', 'panel__label');
    hoverLabel.textContent = 'Hovered';
    hoverSection.append(hoverLabel);

    if (state.hovered && state.hovered.isConnected) {
      const name = el('p', 'name');
      name.textContent = describe(state.hovered);
      const facts = el('dl', 'facts');
      factsFor(state.hovered).forEach(([key, value]) => {
        const term = el('dt', 'facts__key');
        term.textContent = key;
        const detail = el('dd', 'facts__value');
        detail.textContent = value;
        facts.append(term, detail);
      });
      const actions = el('div', 'panel__row');
      actions.append(
        button('btn btn--primary', 'copy-element', 'Copy element', { icon: ICONS.copy }),
        button('btn', 'export', 'Export PNG', { icon: ICONS.download })
      );
      hoverSection.append(name);
      const classes = classButtons(state.hovered);
      if (classes) hoverSection.append(classes);
      hoverSection.append(facts, actions);
    } else {
      const empty = el('p', 'panel__empty');
      empty.textContent = 'Move the pointer over the page.';
      hoverSection.append(empty);
    }

    const rulerSection = el('section', 'panel__section');
    const rulerLabel = el('h3', 'panel__label');
    rulerLabel.textContent = 'Ruler';
    rulerSection.append(rulerLabel);

    const measures = measurements();
    if (measures.length) {
      const list = el('ul', 'pins');
      measures.forEach((measure) => {
        const item = el('li', 'pins__item', { color: '#ed1941' });
        const body = el('div');
        const name = el('span', 'name');
        name.textContent = `Measure ${measure.index}`;
        const meta = el('p', 'pins__meta');
        meta.textContent = measureFacts(measure).map(([key, value]) => `${key} ${value}`).join(' · ');
        body.append(name, meta);
        item.append(
          el('span', 'pins__swatch'),
          body,
          button('pins__remove', 'unmeasure', '', { icon: ICONS.close, index: measure.index - 1, ariaLabel: `Remove measure ${measure.index}` })
        );
        list.append(item);
      });
      const actions = el('div', 'panel__row');
      actions.append(button('btn', 'clear-measures', 'Clear measures', { icon: ICONS.trash }));
      rulerSection.append(list, actions);
    } else {
      const empty = el('p', 'panel__empty');
      empty.textContent = state.ruler.enabled
        ? 'Drag on the page to measure. Shift keeps it straight, edges snap.'
        : 'Press R, then drag on the page to measure.';
      rulerSection.append(empty);
    }

    const pinSection = el('section', 'panel__section');
    const pinLabel = el('h3', 'panel__label');
    pinLabel.textContent = `Frozen · ${state.pins.length}`;
    pinSection.append(pinLabel);

    if (!state.pins.length) {
      const empty = el('p', 'panel__empty');
      empty.textContent = 'Press F to freeze the hovered element.';
      pinSection.append(empty);
    } else {
      const list = el('ul', 'pins');
      const hoveredRect = state.hovered && state.hovered.isConnected ? state.hovered.getBoundingClientRect() : null;

      state.pins.forEach((pin, index) => {
        const item = el('li', 'pins__item', { color: pin.color });
        const body = el('div');
        const name = el('span', 'name');
        name.textContent = describe(pin.el);
        const rect = pin.el.getBoundingClientRect();
        const meta = el('p', 'pins__meta');
        meta.textContent = `${r1(rect.width)} × ${r1(rect.height)}`;
        body.append(name);
        const classes = classButtons(pin.el);
        if (classes) body.append(classes);
        body.append(meta);

        if (hoveredRect && state.hovered !== pin.el) {
          const delta = el('p', 'pins__meta pins__delta');
          const deltaWidth = hoveredRect.width - rect.width;
          const deltaHeight = hoveredRect.height - rect.height;
          delta.textContent = `Δ ${deltaWidth >= 0 ? '+' : ''}${r1(deltaWidth)} × ${deltaHeight >= 0 ? '+' : ''}${r1(deltaHeight)}`;
          body.append(delta);
        }

        item.append(
          el('span', 'pins__swatch'),
          body,
          button('pins__remove', 'unpin', '', { icon: ICONS.close, index, ariaLabel: `Unfreeze ${describe(pin.el)}` })
        );
        list.append(item);
      });

      const actions = el('div', 'panel__row');
      actions.append(
        button('btn', 'copy-report', 'Copy report', { icon: ICONS.copy }),
      button('btn', 'export', 'Export PNG', { icon: ICONS.download }),
        button('btn', 'clear', 'Clear', { icon: ICONS.trash })
      );
      pinSection.append(list, actions);
    }

    const keys = el('dl', 'keys');
    [
      ['F', 'freeze'],
      ['R', 'ruler'],
      ['E', 'export'],
      ['C', 'copy'],
      ['⇧C', 'report'],
      ['X', 'clear'],
      ['L', 'grid/flex'],
      ['D', 'distance'],
      ['A', 'contrast'],
      ['N', 'navigate'],
      ['Esc', 'exit']
    ].forEach(([key, description]) => {
      const term = el('dt', 'keys__key');
      term.textContent = key;
      const detail = el('dd', 'keys__value');
      detail.textContent = description;
      keys.append(term, detail);
    });

    panelBody.append(
      head,
      toggles,
      el('div', 'panel__divider'),
      hoverSection,
      rulerSection,
      pinSection,
      el('div', 'panel__divider'),
      keys
    );
  }

  function signature() {
    const parts = [
      state.showLayout,
      state.showDistances,
      state.showContrast,
      state.ruler.enabled,
      state.copyOnClick,
      state.pins.length,
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
    drawPins();

    const hovered = state.hovered && state.hovered.isConnected ? state.hovered : null;
    if (hovered) {
      drawBoxModel(hovered);
      spacingLabels(hovered);
      if (state.showLayout) drawLayout(hovered);
    }

    if (state.showDistances && hovered) {
      const hoveredRect = hovered.getBoundingClientRect();
      state.pins.forEach((pin) => {
        if (pin.el === hovered || !pin.el.isConnected) return;
        drawDistance(pin.el.getBoundingClientRect(), hoveredRect, pin.color);
      });
    }

    drawRuler();

    if (hovered) drawTip(hovered);
    renderPanel();
    pushState();
  }

  function tick() {
    if (!state.active) return;
    const next = signature();
    if (next !== lastSignature) {
      lastSignature = next;
      render();
    }
    rafId = requestAnimationFrame(tick);
  }

  function invalidate() {
    lastSignature = '';
  }

  function onPointerMove(event) {
    if (!state.active) return;
    if (event.composedPath().includes(panelBody)) return;
    const target = topElementAt(event.clientX, event.clientY);
    if (!target) return;
    if (target !== state.hovered) {
      state.hovered = target;
      invalidate();
    }
  }

  function onPageClick(event) {
    if (!state.active || !state.copyOnClick || event.button !== 0 || event.composedPath().includes(host)) return;
    event.preventDefault();
    event.stopPropagation();
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

  function toggleCopyOnClick() {
    state.copyOnClick = !state.copyOnClick;
    toast(state.copyOnClick ? 'Click copies the class' : 'Clicks reach the page');
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

  function runAction(action, index, value) {
    if (action === 'close') deactivate();
    if (action === 'freeze') togglePin(state.hovered);
    if (action === 'layout') state.showLayout = !state.showLayout;
    if (action === 'distances') state.showDistances = !state.showDistances;
    if (action === 'contrast') state.showContrast = !state.showContrast;
    if (action === 'ruler') setRulerEnabled(!state.ruler.enabled);
    if (action === 'copy-on-click') toggleCopyOnClick();
    if (action === 'unpin') state.pins.splice(Number(index), 1);
    if (action === 'unmeasure') state.ruler.measures.splice(Number(index), 1);
    if (action === 'clear-measures') clearMeasures();
    if (action === 'clear') state.pins = [];
    if (action === 'copy-element') copy(measurementText(state.hovered), 'Element copied');
    if (action === 'copy-report') copy(reportText(), 'Report copied');
    if (action === 'copy-class') copy(value, `${value} copied`);
    if (action === 'export') exportPng();
    if (action === 'popout') setPoppedOut(true);
    if (action === 'popin') setPoppedOut(false);
    invalidate();
  }

  function onPanelClick(event) {
    const trigger = event.target.closest('button');
    if (!trigger) return;
    runAction(trigger.dataset.action, trigger.dataset.index, trigger.dataset.value);
  }

  function setPoppedOut(poppedOut) {
    state.poppedOut = poppedOut;
    panelBody.classList.toggle('is-hidden', poppedOut);
    send({ type: poppedOut ? 'layout-ruler/popout' : 'layout-ruler/popout-close' });
    invalidate();
  }

  function send(message) {
    try {
      chrome.runtime.sendMessage(message)?.catch?.(() => {});
    } catch (error) {
      /* the tab outlived its extension context */
    }
  }

  function snapshot() {
    const hovered = state.hovered && state.hovered.isConnected ? state.hovered : null;
    const hoveredRect = hovered ? hovered.getBoundingClientRect() : null;
    const signed = (value) => `${value >= 0 ? '+' : ''}${r1(value)}`;

    return {
      showLayout: state.showLayout,
      showDistances: state.showDistances,
      showContrast: state.showContrast,
      rulerEnabled: state.ruler.enabled,
      copyOnClick: state.copyOnClick,
      hovered: hovered ? { name: describe(hovered), classes: classNames(hovered), facts: factsFor(hovered) } : null,
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

  function pushState() {
    if (!state.poppedOut) return;
    const now = performance.now();
    if (now - lastPush < 60) return;
    lastPush = now;
    send({ type: 'layout-ruler/state', payload: snapshot() });
  }

  function isEditable(node) {
    if (!node || !node.tagName) return false;
    return node.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(node.tagName);
  }

  function onKeyDown(event) {
    if (!state.active || event.metaKey || event.ctrlKey || event.altKey) return;
    if (isEditable(event.target)) return;

    if (event.key === 'Escape') {
      if (state.ruler.enabled) setRulerEnabled(false);
      else deactivate();
      event.preventDefault();
      return;
    }

    const key = event.key.toLowerCase();
    if (key === 'f') togglePin(state.hovered);
    else if (key === 'c') copy(event.shiftKey ? reportText() : measurementText(state.hovered), event.shiftKey ? 'Report copied' : 'Element copied');
    else if (key === 'e') exportPng();
    else if (key === 'r') setRulerEnabled(!state.ruler.enabled);
    else if (key === 'x') { state.pins = []; clearMeasures(); }
    else if (key === 'l') { state.showLayout = !state.showLayout; invalidate(); }
    else if (key === 'd') { state.showDistances = !state.showDistances; invalidate(); }
    else if (key === 'a') { state.showContrast = !state.showContrast; invalidate(); }
    else if (key === 'n') toggleCopyOnClick();
    else return;

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

  function activate() {
    if (state.active) return;
    if (!host) build();
    if (!host.isConnected) document.documentElement.append(host);
    host.hidden = false;
    state.active = true;
    document.addEventListener('mousemove', onPointerMove, true);
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
    setRulerEnabled(false);
    if (state.poppedOut) setPoppedOut(false);
    cancelAnimationFrame(rafId);
    document.removeEventListener('mousemove', onPointerMove, true);
    window.removeEventListener('mousemove', onRulerMove, true);
    window.removeEventListener('mouseup', onRulerUp, true);
    window.removeEventListener('mousemove', onPanelMove, true);
    window.removeEventListener('mouseup', onPanelUp, true);
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('click', onPageClick, true);
    window.removeEventListener('scroll', onViewportChange, true);
    window.removeEventListener('resize', onViewportChange, true);
    if (host) host.hidden = true;
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'layout-ruler/toggle') {
      if (state.active) deactivate();
      else activate();
    }
    if (message?.type === 'layout-ruler/command') {
      if (message.action === 'ping') pushState();
      else if (message.remote && message.action === 'copy-element') send({ type: 'layout-ruler/clip', text: measurementText(state.hovered), label: 'Element copied' });
      else if (message.remote && message.action === 'copy-report') send({ type: 'layout-ruler/clip', text: reportText(), label: 'Report copied' });
      else if (message.remote && message.action === 'copy-class') send({ type: 'layout-ruler/clip', text: message.value, label: `${message.value} copied` });
      else runAction(message.action, message.index, message.value);
    }
    if (message?.type === 'layout-ruler/popin') {
      state.poppedOut = false;
      panelBody.classList.remove('is-hidden');
      invalidate();
    }
    if (message?.type === 'layout-ruler/clear') {
      state.pins = [];
      invalidate();
    }
    sendResponse({ active: state.active, pins: state.pins.length });
    return true;
  });

  window.__layoutRuler = { activate, deactivate, state };
})();
