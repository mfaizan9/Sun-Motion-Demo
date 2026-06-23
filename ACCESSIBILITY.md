# Accessibility Notes — Sun Motions Simulator

Target: WCAG 2.1 AA (with AAA where reasonable). Human screen-reader QA is still
required (see bottom).

## Structure & semantics
* Single `<h1>` is rendered by the `<kl-unl-masthead>` component ("Sun Motions
  Simulator"); the sim adds only `<h2>` panel headings (Horizon Diagram,
  Information, Time and Location Controls, Animation Controls, General Settings) —
  no skipped levels.
* Landmarks: `<main class="app-layout">`, `<section class="panel">` regions each
  labelled by their heading, masthead `<nav>`.
* `<html lang="en">`.
* Every control is native and labelled: month `<select>` + day `<input>` with
  `<label>`s; `<input type="range">` sliders with `<label>`s; checkboxes/radios in
  `<fieldset>`/`<legend>` groups.

## The canvas (non-text content, 1.1.1)
* The `<canvas>` has `role="img"` and an `aria-describedby` description that is
  **updated every render** with the current state, e.g. *"Sky for an observer at
  latitude 40.8° N on 27 May at 12:00. The sun is above the horizon at altitude
  70.6 degrees and azimuth 182.0 degrees."* — so an audio-only user gets the same
  "what's shown" a sighted user sees.

## Keyboard (2.1.1 / 2.1.2 / 2.4.7)
* Full keyboard operability; visible focus ring from `kl-unl.css` `:focus-visible`.
* **Sliders are native `<input type="range">`** → Left/Down decrement, Right/Up
  increment, PageUp/PageDown larger step, Home/End to min/max — all for free, and
  Tab always moves away (no traps).
* The diagram canvas is focusable (`tabindex="0"`); **arrow keys rotate the view**
  (Left/Right = azimuth, Up/Down = altitude), announced via the live region.
* Every mouse/touch action on the canvas (rotate view, drag the sun to change time
  of day or day of year) has a keyboard-equivalent control: the diagram arrow
  keys, the Time of Day slider/clock, and the Day of Year slider/inputs all mutate
  the same state object.

## Always speak units with numbers (supervisor requirement)
Screen readers only read the accessible name/value, so units are baked into the
spoken value, never left to an adjacent visual label:
* Day of year slider `aria-valuetext`: e.g. *"May 27, day 147 of the year"*.
* Time of day slider `aria-valuetext`: e.g. *"12 hours 0 minutes, 12:00 pm"*.
* Latitude slider `aria-valuetext`: e.g. *"40.8 degrees north"* / *"…south"*.
* Animation-speed slider `aria-valuetext`: e.g. *"3.0 hours per second"*
  (units spelled out: minutes / hours / days).
* Info readouts are visible with symbols (°, h, m); the live region and canvas
  description spell quantity + number + unit for speech.

## Live region (4.1.3)
* `#sr-status` is `aria-live="polite"`. It announces on **commit** (slider
  `change`, drag end, toggle, animation start/stop), not on every tick, e.g.
  *"Sun altitude 70.6 degrees, azimuth 182.0 degrees. 40.8° N."* — avoiding flood
  during animation.
* The canvas description (`#sphere-desc`) uses `aria-live="off"`; it is a
  description read on focus, refreshed each render.

## Colour & contrast (1.4.1 / 1.4.3 / 1.4.11)
* Palette via the KL-UNL CSS custom properties; sim text meets ≥ 4.5:1.
* **State is never colour-only.** Every scene feature has a matching labelled
  control in General Settings ("show the ecliptic", "show the sun's declination
  circle", "show month labels", etc.), and the sun's position is also given as
  numeric altitude/azimuth text and in the live region. Direction labels (N/E/S/W)
  and month labels are drawn as text, not colour cues.
* The physically meaningful colours of the original (blue equator/prime-hour
  circle, white ecliptic, yellow sun-declination circle, red analemma, green
  ground) are preserved but always paired with text/controls.

## Timing & motion (2.2.2 / 2.3.3)
* No motion runs without a stop: animation is user-started and the same button
  toggles **start / stop**; manual inputs are disabled only while animating and
  re-enabled on stop.
* Nothing flashes faster than 3×/second.
* `prefers-reduced-motion`: the sim never auto-animates (motion is always
  user-initiated and instantly stoppable), satisfying the requirement; the diagram
  cursor style is also calmed under reduced-motion.

## Touch / pointer (responsive)
* All canvas interaction uses Pointer Events (one path for mouse + touch);
  draggable canvases set `touch-action: none` so dragging doesn't scroll the page.
* Tap targets meet ≥ 44px (the KL-UNL `.button` sizing and `min-height` on sliders
  and choice rows); no hover-only affordances.
* Layout reflows from desktop → tablet → phone portrait (single column, verified
  no horizontal scroll at 375px) and remains usable at 200% zoom (rem/%/clamp
  units, no fixed-px heights cropping text).

## Equations / MathJax
The original sim contains **no equations** — only numeric readouts. The foundation
ships no MathJax and the self-contained rule forbids a CDN, and the readouts update
per animation frame (per-frame typesetting would be a performance problem).
Readouts are therefore accessible HTML text with spoken units rather than MathJax.
There is no canvas-baked math symbol that needs to move to HTML. (See
CONVERSION_NOTES.md, deviation 1.)

## Colour remaps
None. All scene colours are the original values; none were remapped for contrast
because none is used as the sole signal.

## Still required: human screen-reader QA
This port was self-verified against the source maths and via DOM/ARIA inspection,
but **manual testing with NVDA (Windows, Chrome + Firefox) and VoiceOver (macOS,
Safari + Chrome)** is still needed to confirm announcements are not duplicated,
truncated, or read out of order, and that focus order reads a clear name + value +
unit for every control.
