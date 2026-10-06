# Layout Ruler

Chrome extension (MV3) that inspects layout on hover: box model, sizes, spacing, grid tracks, flex gaps —
and lets you freeze elements to measure and compare against whatever you hover next.

## Install

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → pick this folder.
3. Open any page and click the toolbar icon, or press **Alt + Shift + I** — both toggle the inspector.

## What it shows

- **Box model** on the hovered element: margin / border / padding / content, with px labels for every side.
- **Tooltip** with selector, `width × height`, display, position, font and colour. It sits below the
  element's margin box (clear of grid labels, frozen elements and the panel), falling back to a viewport corner.
- **Grid overlay** for grid containers: every column and row track with its used px size, gaps highlighted.
- **Flex overlay** for flex containers: each item outlined, measured gaps between items, flow/justify/align in the tooltip.
- **Contrast** (option, `A` or the **contrast** button): for hovered elements that hold text, the text colour,
  the effective background (ancestor backgrounds composited), the WCAG ratio and AA / AAA pass–fail
  (large-text thresholds applied automatically). Flags "over an image" when a background image makes it unreliable.
- **Copy**: `C` copies the hovered element's measurements as plain text, `⇧ C` copies a full report
  (hovered element, every frozen element, Δ size and the distances between them). The panel has
  **Copy element** / **Copy report** buttons too.
- **Ruler**: `R` arms it, then drag anywhere on the page — dashed legs and a live label show dx, dy and the
  diagonal length in px. Every drag stays on the page as a numbered measure, so you can measure many
  points; the panel lists them (remove one with its ×, or **Clear measures** / `X`). Shift keeps the drag
  straight, and both ends snap to nearby element edges (6px).
- **Export PNG**: `E` (or the **Export PNG** button) hides the panel, captures the visible tab with every
  overlay drawn on it and downloads it as `layout-ruler-<timestamp>.png`.
- **Classes**: the panel lists every class of the hovered element (and of each frozen one) — click one to
  copy it as `.name`. Clicking the element itself on the page copies all its classes (`.a.b`) and
  doesn't trigger the page's own click. Turn **click copies class** off (or press `N`) to click links and
  navigate the page while the inspector keeps running. Hover stays put while the pointer is over the panel; freeze with `F` to keep it
  while you travel there.
- **Focus map** (`T` or the **focus map** button): numbers every keyboard tab stop in the order Tab visits
  them and joins them with a dashed path, so jumps in the focus order are visible at a glance. Stops with
  `tabindex > 0` are marked red; hidden, disabled, `inert` and `tabindex="-1"` elements are left out, and a
  radio group counts once.
- **Frozen elements**: pin any element, then hover another — dashed rulers show the distance between them
  (edge deltas when they overlap or nest), and the panel lists Δ width / Δ height per frozen element.

The panel itself is draggable — grab its header and move it anywhere to see what it covers. The ⧉ button
pops it out into its own Chrome window, so you can park it on a second monitor; closing that window (or the
⤡ button in it) puts the panel back in the page. The popped-out window carries the same shortcuts — they work whether the page or that window has focus.

## PDFs: colour picker & contrast

Chrome's PDF viewer can't be inspected like a page, so on a `.pdf` tab the toolbar icon / **Alt + Shift + I**
opens a picker tab that renders the whole PDF with the bundled pdf.js (`vendor/`, Apache-2.0) — scroll it freely, and zoom with the − / + / **Fit width** buttons or Ctrl + wheel (pages are re-rendered at every zoom level, so they stay sharp; fonts, cmaps and ICC profiles are bundled too).
A **thumbnails** strip jumps to a page, and **Find in PDF** (`Ctrl + F`, Enter / Shift + Enter for next / previous, accent- and case-insensitive) highlights every match.
If the PDF can't be loaded there, it falls back to a screenshot of the visible area. Pick a **Background** and a **Text** colour by clicking
(or arrow keys + Enter; hex fields and the Eyedropper work too) and it shows the WCAG contrast ratio with
AA / AAA pass–fail for normal text, large text and UI. Text picks snap to the strongest nearby pixel
(toggle off for exact), because anti-aliased glyph edges are lighter than the real text colour.
PDFs opened from `file://` need **Allow access to file URLs** (extension details page) to load fully.

## Keys

| Key | Action |
| --- | --- |
| `Alt + Shift + I` | toggle the inspector |
| `F` | freeze / unfreeze the hovered element |
| `R` | ruler: drag to measure (Shift = straight) |
| `E` | export the current view as PNG |
| `C` | copy the hovered measurements |
| `⇧ C` | copy a full report (hovered + frozen + deltas) |
| `X` | clear every frozen element and ruler measure |
| `L` | grid & flex overlay |
| `D` | distances |
| `A` | contrast (a11y) on/off |
| `N` | navigate: let clicks reach the page (toggles click-to-copy) |
| `T` | focus map: numbered tab order |
| `Esc` | exit |

## Look

Dark soft-black panel, Manrope (Google Fonts, loaded at runtime) at 14px, heroicons outline icons.
Everything renders in a shadow root, so page CSS never leaks in or out.
