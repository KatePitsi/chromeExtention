const ICONS = {
  close: 'M6 18 18 6M6 6l12 12',
  copy: 'M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184',
  download: 'M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3',
  trash: 'm14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.2v.916m7.5 0a48.667 48.667 0 0 0-7.5 0',
  ruler: 'M7.5 21 3 16.5m0 0L7.5 12m-4.5 4.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5'
};

const tabId = Number(new URLSearchParams(location.search).get('tab'));
const togglesNode = document.getElementById('toggles');
const bodyNode = document.getElementById('body');

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
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

function command(action, index, value) {
  chrome.runtime.sendMessage({ type: 'layout-ruler/command', tabId, action, index, value, remote: true }).catch(() => {});
}

function flash(message) {
  const note = document.getElementById('note');
  note.textContent = message;
  note.classList.add('note--visible');
  clearTimeout(flash.timer);
  flash.timer = setTimeout(() => note.classList.remove('note--visible'), 1600);
}

function facts(entries) {
  const list = el('dl', 'facts');
  entries.forEach(([key, value]) => {
    const term = el('dt', 'facts__key');
    term.textContent = key;
    const detail = el('dd', 'facts__value');
    detail.textContent = value;
    list.append(term, detail);
  });
  return list;
}

function classButtons(names) {
  if (!names?.length) return null;
  const list = el('ul', 'classes');
  list.setAttribute('aria-label', 'Classes');
  names.forEach((name) => {
    const item = el('li');
    item.append(button('classes__copy', 'copy-class', `.${name}`, { value: `.${name}`, ariaLabel: `Copy class .${name}` }));
    list.append(item);
  });
  return list;
}

function section(title) {
  const node = el('section', 'panel__section');
  const label = el('h2', 'panel__label');
  label.textContent = title;
  node.append(label);
  return node;
}

function empty(text) {
  const node = el('p', 'panel__empty');
  node.textContent = text;
  return node;
}

const KEYS = [
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
];

const KEY_ACTIONS = {
  f: 'freeze',
  r: 'ruler',
  e: 'export',
  x: 'clear',
  l: 'layout',
  d: 'distances',
  a: 'contrast',
  n: 'copy-on-click'
};

function shortcuts() {
  const list = el('dl', 'keys');
  KEYS.forEach(([key, description]) => {
    const term = el('dt', 'keys__key');
    term.textContent = key;
    const detail = el('dd', 'keys__value');
    detail.textContent = description;
    list.append(term, detail);
  });
  return list;
}

function render(state) {
  togglesNode.replaceChildren(
    button('btn', 'layout', 'grid / flex', { pressed: state.showLayout }),
    button('btn', 'distances', 'distances', { pressed: state.showDistances }),
    button('btn', 'contrast', 'contrast', { pressed: state.showContrast }),
    button('btn', 'ruler', 'ruler', { icon: ICONS.ruler, pressed: state.rulerEnabled }),
    button('btn', 'copy-on-click', 'click copies class', { pressed: state.copyOnClick })
  );

  const hovered = section('Hovered');
  if (state.hovered) {
    const name = el('p', 'name');
    name.textContent = state.hovered.name;
    const actions = el('div', 'panel__row');
    actions.append(
      button('btn btn--primary', 'copy-element', 'Copy element', { icon: ICONS.copy }),
      button('btn', 'export', 'Export PNG', { icon: ICONS.download })
    );
    hovered.append(name);
    const classes = classButtons(state.hovered.classes);
    if (classes) hovered.append(classes);
    hovered.append(facts(state.hovered.facts), actions);
  } else {
    hovered.append(empty('Move the pointer over the page.'));
  }

  const ruler = section('Ruler');
  if (state.measures?.length) {
    const list = el('ul', 'pins');
    state.measures.forEach((measure) => {
      const item = el('li', 'pins__item');
      item.style.color = '#ed1941';
      const body = el('div');
      const name = el('span', 'name');
      name.textContent = `Measure ${measure.index}`;
      const meta = el('p', 'pins__meta');
      meta.textContent = measure.facts.map(([key, value]) => `${key} ${value}`).join(' · ');
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
    ruler.append(list, actions);
  } else ruler.append(empty(state.rulerEnabled ? 'Drag on the page to measure.' : 'Press R, then drag on the page.'));

  const pins = section(`Frozen · ${state.pins.length}`);
  if (!state.pins.length) {
    pins.append(empty('Press F to freeze the element the pointer is on.'));
  } else {
    const list = el('ul', 'pins');
    state.pins.forEach((pin, index) => {
      const item = el('li', 'pins__item');
      item.style.color = pin.color;
      const body = el('div');
      const name = el('span', 'name');
      name.textContent = pin.name;
      const meta = el('p', 'pins__meta');
      meta.textContent = pin.size;
      body.append(name);
      const classes = classButtons(pin.classes);
      if (classes) body.append(classes);
      body.append(meta);
      if (pin.delta) {
        const delta = el('p', 'pins__meta pins__delta');
        delta.textContent = pin.delta;
        body.append(delta);
      }
      item.append(
        el('span', 'pins__swatch'),
        body,
        button('pins__remove', 'unpin', '', { icon: ICONS.close, index, ariaLabel: `Unfreeze ${pin.name}` })
      );
      list.append(item);
    });

    const actions = el('div', 'panel__row');
    actions.append(
      button('btn', 'copy-report', 'Copy report', { icon: ICONS.copy }),
      button('btn', 'clear', 'Clear', { icon: ICONS.trash })
    );
    pins.append(list, actions);
  }

  const divider = el('div', 'panel__divider');
  bodyNode.replaceChildren(hovered, ruler, pins, divider, shortcuts());
}

document.addEventListener('click', (event) => {
  const trigger = event.target.closest('button');
  if (!trigger) return;
  command(trigger.dataset.action, trigger.dataset.index, trigger.dataset.value);
});

document.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const key = event.key.toLowerCase();

  if (key === 'escape') {
    command('close');
  } else if (key === 'c') {
    command(event.shiftKey ? 'copy-report' : 'copy-element');
  } else if (KEY_ACTIONS[key]) {
    command(KEY_ACTIONS[key]);
  } else {
    return;
  }

  event.preventDefault();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.tabId !== tabId) return;
  if (message.type === 'layout-ruler/state') render(message.payload);
  if (message.type === 'layout-ruler/clip') {
    navigator.clipboard.writeText(message.text)
      .then(() => flash(message.label))
      .catch(() => flash('Copy failed'));
  }
});

render({ showLayout: true, showDistances: true, showContrast: true, rulerEnabled: false, copyOnClick: true, hovered: null, measures: [], pins: [] });
command('ping');
