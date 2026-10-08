globalThis.LayoutRulerPanel = (() => {
  const ICONS = {
    close: 'M6 18 18 6M6 6l12 12',
    copy: 'M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184',
    ruler: 'M7.5 21 3 16.5m0 0L7.5 12m-4.5 4.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5',
    popout: 'M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25',
    popin: 'M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25',
    download: 'M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3',
    trash: 'm14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.2v.916m7.5 0a48.667 48.667 0 0 0-7.5 0',
    back: 'M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3'
  };

  const TOGGLE_GROUPS = [
    ['Overlays', [
      ['layout', 'grid / flex + distances'],
      ['ruler', 'ruler', ICONS.ruler],
      ['grid-ruler', 'grid ruler'],
      ['layout-grid', 'layout grid'],
      ['design', 'pixel perfect image']
    ]],
    ['Checks', [
      ['contrast', 'contrast'],
      ['a11y', 'a11y'],
      ['headings', 'headings'],
      ['focus-map', 'focus map'],
      ['overflow', 'overflow'],
      ['spacing', 'spacing scale']
    ]],
    ['Behaviour', [
      ['copy-on-click', 'click copies class']
    ]]
  ];

  const KEYS = [
    ['F', 'freeze'],
    ['R', 'ruler'],
    ['U', 'grid ruler'],
    ['E', 'export'],
    ['C', 'copy'],
    ['⇧C', 'report'],
    ['X', 'clear all'],
    ['L', 'grid / flex + distances'],
    ['G', 'layout grid'],
    ['P', 'pixel perfect image'],
    ['A', 'contrast'],
    ['I', 'a11y'],
    ['H', 'headings'],
    ['T', 'focus map'],
    ['O', 'overflow'],
    ['S', 'spacing scale'],
    ['N', 'navigate'],
    ['Enter', 'inspect iframe'],
    ['Esc', 'exit']
  ];

  const KEY_ACTIONS = {
    f: 'freeze',
    r: 'ruler',
    u: 'grid-ruler',
    e: 'export',
    x: 'clear-all',
    l: 'layout',
    g: 'layout-grid',
    p: 'design',
    a: 'contrast',
    i: 'a11y',
    h: 'headings',
    t: 'focus-map',
    o: 'overflow',
    s: 'spacing',
    n: 'copy-on-click'
  };

  const SECTIONS = ['head', 'toggles', 'hovered', 'overflow', 'outline', 'grid', 'design', 'spacing', 'ruler', 'frozen', 'keys'];
  const TYPING = /^(text|search|number|email|url|tel|password|range)$/;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
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

  function heading(level, text) {
    return el(`h${Math.min(level, 6)}`, 'panel__label', text);
  }

  function section(options, title) {
    const node = el('section', 'panel__section');
    node.append(heading(options.level + 1, title));
    return node;
  }

  function empty(text) {
    return el('p', 'panel__empty', text);
  }

  function row(...children) {
    const node = el('div', 'panel__row');
    node.append(...children);
    return node;
  }

  function facts(entries) {
    const list = el('dl', 'facts');
    entries.forEach(([key, value]) => list.append(el('dt', 'facts__key', key), el('dd', 'facts__value', value)));
    return list;
  }

  function flags(items) {
    const list = el('ul', 'flags');
    items.forEach((text) => list.append(el('li', 'flags__item', `⚠ ${text}`)));
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

  function numberField(label, field, value, options = {}) {
    const wrap = el('label', 'field');
    const input = el('input', 'field__input');
    input.type = 'number';
    input.dataset.field = field;
    input.step = String(options.step ?? 1);
    if (options.min !== undefined) input.min = String(options.min);
    if (options.max !== undefined) input.max = String(options.max);
    input.value = value ?? '';
    if (options.placeholder) input.placeholder = options.placeholder;
    wrap.append(el('span', 'field__label', label), input);
    return wrap;
  }

  function list(items, build) {
    const node = el('ul', 'pins');
    items.forEach((item, index) => node.append(build(item, index)));
    return node;
  }

  function more(total, shown) {
    return total > shown ? el('p', 'panel__empty', `+${total - shown} more`) : null;
  }

  const builders = {
    head(slice, options) {
      const head = el('header', 'panel__head');
      const title = el(`h${options.level}`, 'panel__title');
      title.append(el('span', 'panel__dot'), 'FE Inspector');
      const buttons = options.mode === 'window'
        ? [button('panel__close', 'popin', '', { icon: ICONS.popin, ariaLabel: 'Put the panel back in the page' })]
        : [
            button('panel__close', 'popout', '', { icon: ICONS.popout, ariaLabel: 'Move the panel to its own window' }),
            button('panel__close', 'close', '', { icon: ICONS.close, ariaLabel: 'Close the layout inspector' })
          ];
      head.append(title, ...buttons);
      const nodes = [head];
      if (slice.viewport) nodes.push(el('p', 'panel__meta', slice.viewport));
      if (slice.child) {
        nodes.push(row(
          el('span', 'panel__meta', 'Inspecting inside an iframe.'),
          button('btn', 'exit-frame', 'Back to the parent page', { icon: ICONS.back })
        ));
      }
      return nodes;
    },

    toggles(slice) {
      return TOGGLE_GROUPS.map(([label, toggles]) => {
        const group = el('div', 'panel__group');
        const id = `lr-group-${label.toLowerCase()}`;
        const name = el('span', 'panel__groupLabel', label);
        name.id = id;
        group.setAttribute('role', 'group');
        group.setAttribute('aria-labelledby', id);
        group.append(name, row(...toggles.map(([action, text, path]) => button('btn', action, text, { icon: path, pressed: Boolean(slice[action]) }))));
        return group;
      }).concat(el('div', 'panel__divider'));
    },

    hovered(slice, options) {
      const node = section(options, 'Hovered');
      if (!slice) {
        node.append(empty('Move the pointer over the page.'));
        return [node];
      }
      node.append(el('p', 'name', slice.name));
      const classes = classButtons(slice.classes);
      if (classes) node.append(classes);
      node.append(facts(slice.facts));
      if (slice.a11y) {
        node.append(heading(options.level + 2, 'Accessibility'), facts(slice.a11y));
      }
      if (slice.flags?.length) node.append(flags(slice.flags));
      if (slice.frame) {
        node.append(row(button('btn', 'enter-frame', 'Inspect inside this iframe (Enter)')));
      }
      node.append(row(
        button('btn btn--primary', 'copy-element', 'Copy element', { icon: ICONS.copy }),
        button('btn', 'export', 'Export PNG', { icon: ICONS.download })
      ));
      return [node];
    },

    overflow(slice, options) {
      if (!slice) return [];
      const node = section(options, 'Overflow');
      node.append(el('p', 'pins__meta', slice.summary));
      if (!slice.items.length) {
        node.append(empty(slice.scanning ? 'Scanning…' : 'No overflowing or clipped elements found.'));
        return [node];
      }
      const shown = slice.items.slice(0, 60);
      node.append(list(shown, (item) => {
        const entry = el('li');
        entry.append(button('pick', 'reveal', '', { index: item.index, value: 'overflow' }));
        const pick = entry.firstChild;
        pick.append(el('span', 'pick__tag', item.kind), el('span', 'pick__name', item.name), el('span', 'pick__meta', item.label));
        return entry;
      }));
      const rest = more(slice.items.length, shown.length);
      if (rest) node.append(rest);
      return [node];
    },

    outline(slice, options) {
      if (!slice) return [];
      const node = section(options, 'Headings & landmarks');
      if (slice.warnings.length) node.append(flags(slice.warnings));
      node.append(heading(options.level + 2, `Headings · ${slice.headings.length}`));
      if (slice.headings.length) {
        node.append(list(slice.headings.slice(0, 150), (item) => {
          const entry = el('li');
          entry.style.setProperty('--level', String(item.level - 1));
          const pick = button('pick pick--heading', 'reveal', '', { index: item.index, value: 'heading' });
          pick.append(el('span', 'pick__tag', `H${item.level}`), el('span', 'pick__name', item.text || '(empty)'));
          entry.append(pick);
          return entry;
        }));
      } else node.append(empty('No headings on this page.'));
      node.append(heading(options.level + 2, `Landmarks · ${slice.landmarks.length}`));
      if (slice.landmarks.length) {
        node.append(list(slice.landmarks.slice(0, 60), (item) => {
          const entry = el('li');
          const pick = button('pick', 'reveal', '', { index: item.index, value: 'landmark' });
          pick.append(el('span', 'pick__tag', item.role), el('span', 'pick__name', item.name || '(no name)'));
          entry.append(pick);
          return entry;
        }));
      } else node.append(empty('No landmarks on this page.'));
      return [node];
    },

    grid(slice, options) {
      if (!slice) return [];
      const preset = slice.preset;
      const node = section(options, `Layout grid · ${preset.name} ≥${preset.minWidth}`);
      const fields = el('div', 'fields');
      fields.append(
        numberField('Columns', 'grid.columns', preset.columns, { min: 1, max: 48 }),
        numberField('Gutter px', 'grid.gutter', preset.gutter, { min: 0 }),
        numberField('Margin px', 'grid.margin', preset.margin, { min: 0 }),
        numberField('Max width px', 'grid.maxWidth', preset.maxWidth, { min: 0, placeholder: 'none' }),
        numberField('From width px', 'grid.minWidth', preset.minWidth, { min: 0 })
      );
      node.append(
        el('p', 'panel__empty', `Editing the ${preset.name} preset (the one that applies at this viewport width). Saved for ${slice.origin}.`),
        fields,
        row(button('btn', 'grid-reset', 'Reset to defaults', { icon: ICONS.trash }))
      );
      return [node];
    },

    design(slice, options) {
      if (!slice) return [];
      const node = section(options, 'Pixel perfect image');
      const file = el('label', 'field field--file');
      const input = el('input', 'field__input');
      input.type = 'file';
      input.accept = 'image/png,image/jpeg,image/webp';
      input.dataset.field = 'design.file';
      file.append(el('span', 'field__label', slice.has ? 'Replace image' : 'Image file'), input);
      node.append(file, el('p', 'panel__empty', 'Or paste an image while the panel has focus. It is saved for this page.'));
      if (!slice.has) return [node];

      const opacity = el('label', 'field');
      const range = el('input', 'field__input');
      range.type = 'range';
      range.min = '0';
      range.max = '100';
      range.value = String(slice.opacity);
      range.dataset.field = 'design.opacity';
      opacity.append(el('span', 'field__label', 'Opacity %'), range);

      const fields = el('div', 'fields');
      fields.append(
        opacity,
        numberField('Offset X px', 'design.x', slice.x),
        numberField('Offset Y px', 'design.y', slice.y)
      );

      const scale = el('fieldset', 'choice');
      scale.append(el('legend', 'field__label', 'Scale'));
      [['1', '1×'], ['2', '2× export'], ['fit', 'fit width']].forEach(([value, text]) => {
        const label = el('label', 'choice__option');
        const radio = el('input');
        radio.type = 'radio';
        radio.name = 'lr-design-scale';
        radio.value = value;
        radio.checked = String(slice.scale) === value;
        radio.dataset.field = 'design.scale';
        label.append(radio, text);
        scale.append(label);
      });

      node.append(
        fields,
        scale,
        row(
          button('btn', 'design-drag', 'drag to move', { pressed: slice.drag }),
          button('btn', 'design-scroll', 'scrolls with page', { pressed: slice.scroll }),
          button('btn', 'design-blend', 'difference blend', { pressed: slice.blend }),
          button('btn', 'design-remove', 'Remove image', { icon: ICONS.trash })
        )
      );
      return [node];
    },

    spacing(slice, options) {
      if (!slice) return [];
      const node = section(options, 'Spacing scale');
      const fields = el('div', 'fields');
      fields.append(numberField('Base px', 'spacing.base', slice.base, { min: 1, step: 0.5 }));
      node.append(
        fields,
        el('p', 'panel__empty', `Margin, padding and gap values that are not multiples of ${slice.base}px are marked with “!”. Root font-size is ${slice.rootFontSize}px, so values also show rem.`)
      );
      return [node];
    },

    ruler(slice, options) {
      const node = section(options, 'Ruler');
      if (!slice.measures.length) {
        node.append(empty(slice.enabled
          ? 'Drag on the page to measure. Shift keeps it straight, edges snap.'
          : 'Press R, then drag on the page to measure.'));
        return [node];
      }
      node.append(list(slice.measures, (measure) => {
        const item = el('li', 'pins__item');
        item.style.color = '#ed1941';
        const body = el('div');
        body.append(el('span', 'name', `Measure ${measure.index}`), el('p', 'pins__meta', measure.facts.map(([key, value]) => `${key} ${value}`).join(' · ')));
        item.append(
          el('span', 'pins__swatch'),
          body,
          button('pins__remove', 'unmeasure', '', { icon: ICONS.close, index: measure.index - 1, ariaLabel: `Remove measure ${measure.index}` })
        );
        return item;
      }), row(button('btn', 'clear-measures', 'Clear measures', { icon: ICONS.trash })));
      return [node];
    },

    frozen(slice, options) {
      const node = section(options, `Frozen · ${slice.length}`);
      if (!slice.length) {
        node.append(empty('Press F to freeze the hovered element.'));
        return [node];
      }
      node.append(list(slice, (pin, index) => {
        const item = el('li', 'pins__item');
        item.style.color = pin.color;
        const body = el('div');
        body.append(el('span', 'name', pin.name));
        const classes = classButtons(pin.classes);
        if (classes) body.append(classes);
        body.append(el('p', 'pins__meta', pin.size));
        if (pin.delta) body.append(el('p', 'pins__meta pins__delta', pin.delta));
        item.append(
          el('span', 'pins__swatch'),
          body,
          button('pins__remove', 'unpin', '', { icon: ICONS.close, index, ariaLabel: `Unfreeze ${pin.name}` })
        );
        return item;
      }), row(
        button('btn', 'copy-report', 'Copy report', { icon: ICONS.copy }),
        button('btn', 'export', 'Export PNG', { icon: ICONS.download }),
        button('btn', 'clear', 'Clear', { icon: ICONS.trash })
      ));
      return [node];
    },

    keys() {
      const details = el('details', 'shortcuts');
      details.append(el('summary', 'shortcuts__summary', 'Shortcuts'));
      const keys = el('dl', 'keys');
      KEYS.forEach(([key, description]) => keys.append(el('dt', 'keys__key', key), el('dd', 'keys__value', description)));
      details.append(keys);
      return [el('div', 'panel__divider'), details];
    }
  };

  function slices(snapshot, options) {
    return {
      head: { viewport: snapshot.viewport, child: snapshot.child, mode: options.mode },
      toggles: snapshot.toggles,
      hovered: snapshot.hovered,
      overflow: snapshot.overflow,
      outline: snapshot.outline,
      grid: snapshot.grid,
      design: snapshot.design,
      spacing: snapshot.spacing,
      ruler: { enabled: snapshot.toggles.ruler, measures: snapshot.measures },
      frozen: snapshot.pins,
      keys: null
    };
  }

  function focusedIn(container) {
    const active = container.getRootNode().activeElement;
    return active && container.contains(active) ? active : null;
  }

  function identity(node) {
    return {
      action: node.dataset.action,
      field: node.dataset.field,
      index: node.dataset.index,
      value: node.dataset.value ?? (node.type === 'radio' ? node.value : undefined)
    };
  }

  function restoreFocus(slot, wanted) {
    const candidates = [...slot.querySelectorAll('[data-action], [data-field]')];
    const same = (node, keys) => keys.every((key) => identity(node)[key] === wanted[key]);
    const target = candidates.find((node) => same(node, ['action', 'field', 'index', 'value']))
      || candidates.find((node) => same(node, ['action', 'field']))
      || candidates[0];
    target?.focus();
  }

  function render(container, snapshot, options) {
    const settings = { mode: 'page', level: 2, ...options };
    if (!container.layoutRulerSlots) {
      container.layoutRulerSlots = {};
      container.layoutRulerSignatures = {};
      SECTIONS.forEach((name) => {
        const slot = el('div', 'panel__slot');
        slot.dataset.section = name;
        container.layoutRulerSlots[name] = slot;
        container.append(slot);
      });
    }

    const focused = focusedIn(container);
    const parts = slices(snapshot, settings);
    SECTIONS.forEach((name) => {
      const slot = container.layoutRulerSlots[name];
      const signature = JSON.stringify(parts[name] ?? null);
      if (container.layoutRulerSignatures[name] === signature) return;
      const holdsFocus = focused && slot.contains(focused);
      if (holdsFocus && focused.tagName === 'INPUT' && TYPING.test(focused.type)) return;
      slot.replaceChildren(...builders[name](parts[name], settings));
      container.layoutRulerSignatures[name] = signature;
      if (holdsFocus) restoreFocus(slot, identity(focused));
    });
  }

  function fieldValue(input) {
    if (input.type === 'number' || input.type === 'range') return input.value === '' ? null : Number(input.value);
    return input.value;
  }

  function imageFrom(dataTransfer) {
    return [...(dataTransfer?.files || [])].find((file) => file.type.startsWith('image/')) || null;
  }

  function bind(container, dispatch) {
    container.addEventListener('click', (event) => {
      const trigger = event.target.closest('button[data-action]');
      if (!trigger || !container.contains(trigger)) return;
      dispatch(trigger.dataset.action, trigger.dataset.index, trigger.dataset.value);
    });

    container.addEventListener('change', (event) => {
      const input = event.target.closest('[data-field]');
      if (!input) return;
      if (input.type === 'file') {
        if (input.files?.[0]) dispatch('design-file', undefined, input.files[0]);
        input.value = '';
        return;
      }
      if (input.type === 'radio' && !input.checked) return;
      dispatch('set', input.dataset.field, fieldValue(input));
    });

    container.addEventListener('input', (event) => {
      const input = event.target.closest('input[type="range"][data-field]');
      if (input) dispatch('set', input.dataset.field, fieldValue(input));
    });

    container.addEventListener('paste', (event) => {
      if (!container.layoutRulerSlots?.design.childElementCount) return;
      const file = imageFrom(event.clipboardData);
      if (!file) return;
      event.preventDefault();
      dispatch('design-file', undefined, file);
    });
  }

  function isEditable(node) {
    if (!node || !node.tagName) return false;
    return node.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(node.tagName);
  }

  function isActivatable(node) {
    return Boolean(node?.closest?.('a[href], button, summary, input, select, textarea, [role="button"], [role="link"], [tabindex]'));
  }

  function keyAction(event) {
    if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return null;
    const target = event.composedPath()[0];
    if (isEditable(target)) return null;
    if (event.key === 'Escape') return 'escape';
    if (event.key === 'Enter') return isActivatable(target) ? null : 'enter-frame';
    const key = event.key.toLowerCase();
    if (key === 'c') return event.shiftKey ? 'copy-report' : 'copy-element';
    return KEY_ACTIONS[key] || null;
  }

  return { render, bind, keyAction, KEYS };
})();
