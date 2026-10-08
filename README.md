# FE Inspector

Chrome extension (MV3) that inspects layout on hover: box model, sizes, spacing, grid tracks, flex gaps —
and lets you freeze elements to measure and compare against whatever you hover next. It also checks
accessibility (names, roles, target size, headings, landmarks, focus order), finds overflow and clipping,
and overlays a layout grid or a design image to compare a build against the comp.

Requires Chrome 130 or later.

## Install

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → pick this folder.
3. Open any page and click the toolbar icon, or press **Alt + Shift + I** — both toggle the inspector.

## What it shows

- **Box model** on the hovered element: margin / border / padding / content, with px labels for every side.
- **Tooltip** with selector, `width × height`, display, position, font-family, the font actually used (loaded web font, installed font or browser default, with the fonts it skipped and why, and a note when a missing weight is synthesized), font-size, line-height, font-weight and colour. It sits below the
  element's margin box (clear of grid labels, frozen elements and the panel), falling back to a viewport corner.
- **Grid overlay** for grid containers: every column and row track with its used px size, gaps highlighted.
  Tracks follow `justify-content` / `align-content` distribution, `direction: rtl`, the container's own scroll
  position and transformed (scaled) ancestors. Subgrids are labelled rather than drawn.
- **Flex overlay** for flex containers: each item outlined, measured gaps between items, flow/justify/align in the tooltip.
- **Contrast** (always on, under Accessibility in the panel): for hovered elements that hold text (on a button or
  link, the text inside it, e.g. in a nested `<span>`), the text colour,
  the effective background, the WCAG ratio and AA / AAA pass–fail (large-text thresholds applied automatically).
  The background is taken from what is actually painted under the text (every element in the paint stack, not
  only ancestors). `opacity` is applied as a group to the text and the backgrounds inside it, the way the browser
  paints it. It flags "over an image or gradient" when a background image, gradient, `<img>`, `<video>` or
  `<canvas>` sits under the text, notes when only ancestors could be sampled, and when a `::before` / `::after`
  background could not be sampled. On a control with its own background it also shows that
  fill against what is around it (1.4.11, informational: a text label already identifies the control).
- **A11y** (always on for the hovered element; the tooltip shows the role, name, contrast, target size and every issue, including an AA contrast fail, so nothing needs scrolling in the panel): role, accessible name and where the name came from (aria-labelledby,
  aria-label, label, alt, legend, content, title, placeholder), description, ARIA states and the target size
  against 24×24 (WCAG 2.5.8) and 44×44 (2.5.5). It flags interactive elements with no name, a control whose
  `aria-label` / `aria-labelledby` name doesn't contain its visible label (2.5.3 Label in Name; images, sr-only
  text and icon-font glyphs don't count as visible, punctuation and case are ignored), `aria-hidden` on focusable content, positive
  `tabindex`, images without `alt` and empty headings. The computation follows the common accname steps; it is
  close to, but not a replacement for, the browser's accessibility tree on edge cases.
- **Headings & landmarks** (`H`): badges every heading level and landmark on the page, and the panel lists the
  outline. It warns about a missing or repeated level-1 heading, skipped levels, empty headings, a missing or
  repeated `main`, and repeated landmarks without unique names. Click an entry to scroll to it and lock on it.
- **Focus map** (`T` or the **focus map** button): numbers every keyboard tab stop in the order Tab visits
  them and joins them with a dashed path, so jumps in the focus order are visible at a glance. Stops with
  `tabindex > 0` are marked red and stops smaller than 24×24 get a dotted frame; hidden, disabled, `inert` and
  `tabindex="-1"` elements are left out, and a radio group counts once.
- **Overflow** (`O`): finds the element that makes the page scroll sideways (the one whose box passes the
  viewport edge while its parent's doesn't, with likely causes such as `width: 100vw`, `min-width: auto` on a flex/grid item, `min-width`, `nowrap` or a negative
  margin), and every element whose `overflow: hidden | clip` is cutting content off. The panel lists them; click
  one to scroll to it and lock on it. It scans up to 5,000 elements in idle time and rescans every 2 seconds.
- **Spacing scale** (`S`): set a base (4px by default) and every margin, padding and gap that isn't a multiple
  of it is marked with "!". Sizes, spacing and font sizes also show rem, based on the root font size.
- **Layers** (`Z` or the **layers / z-index** button): hover a component and every absolute, fixed, sticky or
  z-indexed element in it (or overlapping it) gets a purple frame and a chip with its z-index
  (the order follows stacking contexts, then z-index, then DOM order). The panel lists them front to back (top row painted on top) with
  position, z-index, inset (`top` / `right` / `bottom` / `left` as written), the element they are positioned
  against, the stacking context they sit in and whether they create one. A hovered positioned element also gets
  its containing block outlined in yellow. Click a chip or a row to lock on that element.
- **Viewport sizes** (`V` or the **viewport sizes** button): one click sets the page area to a common responsive
  size — 320 × 568, 375 × 667, 390 × 844, 430 × 932, 768 × 1024, 1024 × 768, 1280 × 800, 1366 × 768,
  1440 × 900, 1920 × 1080 — or to a custom width and height. The tab moves into its own small window (a normal
  Chrome window can't get narrower than about 500px), sized so `innerWidth` / `innerHeight`, the values media
  queries use, match exactly, page zoom included. **Back to the normal window** puts the tab back where it was.
- **Desktop safe areas** (`A` or the **desktop safe areas** button): a screen of 1920 × 1080 doesn't give the page
  1080px — tabs, address bar and taskbar take their share. This draws a dashed fold line, at its page position, for
  the usual real viewport heights — 2560 × 1440 → ≈ 1305px, 1920 × 1080 → ≈ 945px, 1440 × 900 → ≈ 790px,
  1536 × 864 → ≈ 730px, 1366 × 768 → ≈ 657px (Chrome, no bookmarks bar) — and shades what falls below it. The
  panel header (and the layout grid chip) always shows the current viewport and, at desktop widths, the safe area
  of the closest common screen.
- **Layout grid** (`G`): draws the design's column grid over the page, with presets per breakpoint — mobile
  (from 0, 4 columns), tablet (from 768, 8 columns) and desktop (from 1024, 12 columns, max 1440) by default.
  The preset that applies at the current window width is the one shown and edited (columns, gutter, side margin,
  max width, starting width). Presets are saved per site. A chip at the top shows the viewport size and preset.
- **Design image** (`P`): choose or paste a PNG / JPG / WebP and it is laid over the page. You can set:
  - opacity
  - X / Y offset (the arrow keys step the number fields), or turn on **drag to move** and drag the image on the page
  - scale: 1×, 2× for retina exports, or fit to width
  - whether it scrolls with the page
  - a **difference** blend, which turns matching pixels black
  The image and its settings are saved for that page URL.
- **Copy**: `C` copies the hovered element's measurements as plain text, `⇧ C` copies a full report
  (hovered element, every frozen element, Δ size and the distances between them, ruler measures, overflow and
  outline findings). The panel has **Copy element** / **Copy report** buttons too.
- **Ruler**: `R` arms it, then drag anywhere on the page — dashed legs and a live label show dx, dy and the
  diagonal length in px. Every drag stays on the page as a numbered measure and stays attached to the page
  when you scroll (measures inside a separately scrolling box don't follow that box). The panel lists them
  (remove one with its ×, or **Clear measures** / `X`). Shift keeps the drag straight, and both ends snap to
  nearby element edges (6px).
- **Export PNG**: `E` (or the **Export PNG** button) hides the panel, captures the visible tab with every
  overlay drawn on it and downloads it as `fe-inspector-<timestamp>.png`.
- **Classes**: the panel lists every class of the hovered element (and of each frozen one) — click one to
  copy it as `.name`. With **click copies class** on (or `N`), clicking the element itself on the page copies
  all its classes (`.a.b`) and doesn't trigger the page's own click; it starts off, so clicks reach the page. Hover stays put while the pointer is over the panel; freeze with `F` to keep it
  while you travel there.
- **Frozen elements**: pin any element, then hover another — dashed rulers show the distance between them
  (edge deltas when they overlap or nest), and the panel lists Δ width / Δ height per frozen element.
- **Iframes**: the inspector runs in the top page. Hover an iframe and press **Enter** (or the panel's
  **Inspect inside this iframe** button) to move the inspector into it; **Esc** or **Back to the parent page**
  returns. Moving between frames closes a popped-out panel window.

The panel is draggable — grab its header and move it anywhere to see what it covers. Toggles are grouped
(Layout, Measure, Design, Accessibility, Behaviour). Every toggle starts off when you open the inspector; while it
stays on, the toggle states survive reloads in that tab. The spacing base is remembered between sessions. The ⧉
button pops the panel out into its own Chrome window, so you can park it on a second monitor; closing that
window (or the ⤡ button in it) puts the panel back in the page. The popped-out window carries the same
shortcuts — they work whether the page or that window has focus. Keyboard focus stays on the control you used
when the panel updates.

## PDFs: colour picker & contrast

Chrome's PDF viewer can't be inspected like a page, so on a `.pdf` tab the toolbar icon / **Alt + Shift + I**
opens a picker tab that renders the whole PDF with the bundled pdf.js (`vendor/`, Apache-2.0) — scroll it freely, and zoom with the − / + / **Fit width** buttons or Ctrl + wheel (pages are re-rendered at every zoom level, so they stay sharp; fonts, cmaps and ICC profiles are bundled too).
A **thumbnails** strip jumps to a page, and **Find in PDF** (`Ctrl + F`, Enter / Shift + Enter for next / previous, accent- and case-insensitive) highlights every match.
If the PDF can't be loaded there, it falls back to a screenshot of the visible area. Pick a **Background** and a **Text** colour by clicking
(or arrow keys + Enter, which keep working after a zoom; hex fields and the Eyedropper work too) and it shows the WCAG contrast ratio with
AA / AAA pass–fail for normal text, large text and UI. Text picks snap to the strongest nearby pixel
(toggle off for exact), because anti-aliased glyph edges are lighter than the real text colour.
Reloading the picker tab keeps the capture; it is deleted when the tab closes.
PDFs opened from `file://` need **Allow access to file URLs** (extension details page) to load fully.

## Keys

| Key | Action |
| --- | --- |
| `Alt + Shift + I` | toggle the inspector (stays on across reloads and page changes in that tab until toggled off) |
| `F` | freeze / unfreeze the hovered element |
| `R` | ruler: drag to measure (Shift = straight) |
| `U` | grid ruler: 37.8px grid, clicks reach the page |
| `E` | export the current view as PNG |
| `C` | copy the hovered measurements |
| `⇧ C` | copy a full report (hovered + frozen + deltas + findings) |
| `X` | clear every frozen element and ruler measure |
| `L` | grid & flex overlay + distances |
| `G` | layout grid (per-breakpoint columns) |
| `P` | design image overlay |
| `H` | headings & landmarks map |
| `T` | focus map: numbered tab order |
| `O` | overflow & clipping finder |
| `S` | spacing scale + rem |
| `Z` | layers: stacking order, z-index, inset |
| `V` | viewport sizes: resize to common responsive sizes |
| `A` | desktop safe areas: fold lines for real browser heights |
| `N` | navigate: let clicks reach the page (toggles click-to-copy) |
| `Enter` | inspect inside the hovered iframe |
| `Esc` | release lock → disarm ruler → leave iframe → exit |

The letter shortcuts only work while the inspector is on, and never while typing in a field.

## Look

Dark soft-black panel, Manrope (Google Fonts, loaded at runtime) at 14px, heroicons outline icons.
Everything renders in shadow roots, so page CSS never leaks in or out. The panel's styles live in one file,
`panel/panel.css`, shared by the in-page panel and the popped-out window, and `panel/render.js` builds both.
