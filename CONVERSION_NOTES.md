# Conversion Notes — Sun Motions Simulator (Flash AS1 → accessible HTML5)

## Behavior model (one paragraph)

The simulator renders a **horizon diagram**: the sky drawn as a celestial sphere
centered on an observer (a stick figure) at a chosen **latitude**, for a chosen
**day of year** and **time of day**. From the day it computes the sun's right
ascension, declination and the equation of time; from the day it also computes
local sidereal time. These place the sun on the sphere and drive the readouts
(altitude, azimuth, RA, declination, equation of time, sidereal time, hour
angle). The 3D scene is an orthographic projection controlled by a viewer
azimuth/altitude (drag to rotate). Drawn in code: the celestial equator, the
prime-hour (0ʰ RA) circle, the ecliptic, the sun's daily declination circle, two
meridian circles, the NCP/SCP axis, the sun disk, month labels, the green horizon
plane, sky/twilight shading, and the optional analemma (figure-eight). The user
can animate continuously (fast-forward in time) or step by day (time of day held
fixed while the day advances — e.g. to trace the noon sun across the year), with a
log-scaled speed control, and can toggle scene features in General Settings.

## Source of truth

* **Behavior:** the decompiled ActionScript under `scripts/` — chiefly
  `Solar Position Functions.as`, `CelestialSphere.as` + the numbered `CS *` helper
  files (`2 CS Getter Setter` … `9 CS Lines`), `Simulation Master.as`,
  `Analemma Curve.as`, `Sun Disk.as`, the panel scripts, and
  `Numerical Formatting Functions.as`.
* **Chrome / layout:** the KL-UNL foundation files + the original screenshot
  (`frames/1.png`) for panel grouping and reading order.

## Astronomy / constants — copied VERBATIM

All trig constants and the four solar functions are copied byte-for-byte from
`Solar Position Functions.as` into `simulation.js`:

* `getPositionAndEqnOfTime(day)` → `{ ra (hours), dec (deg), eqn (minutes) }`
* `getPosition(day)`, `getEqnOfTime(day)`, `getSiderealTime(day)`

Verified against the original's default state (latitude 40.8° N, day 146.5 = **27
May**, 12:00) and against known reference points:

| Check | Result |
|---|---|
| Default noon altitude (lat 40.8°, 27 May) | **70.6°** (matches original screenshot) |
| Equation of time, default | **2:49** (matches original screenshot) |
| Declination, default | 21.4°; RA 4h 19m; sidereal 4h 21m; hour angle 0h 2m |
| Equinox-equator noon altitude (lat 0°) | 68.6° = 90 − 21.4 ✓ |
| Winter-solstice declination (day 355 = 22 Dec) | −23.4° ✓; noon alt at 40.8° = 25.8° = 90 − 40.8 − 23.4 ✓ |
| Midnight (default) | sun below horizon, altitude −27.9° ✓ |

Number formatting reproduces the AS `Number.prototype.toFixed` override
(round-half-up) as `toFixedAS()`, and the Info-panel formats (`Xh Ym`, `M:SS`
equation of time with sign, hour angle wrapped past 12h, `D.D° N/S`) are ported
exactly.

## 3D engine mapping (AS → canvas)

The Flash engine drew into a deep stack of `MovieClip`s ordered by `swapDepths`.
That is reproduced on a single `<canvas>` with a painter's-algorithm `render()`
driven by one state object:

| ActionScript | HTML5 port |
|---|---|
| `doA / doM / doB` projection matrices | `sphere.doA/doM/doB` (identical formulae) |
| `parsePointInput`, `WtoSz`, `CtoSz`, `CtoW`, `StoMH`, `MHtoC` | same names/maths on `sphere` |
| `CSCirclesClass` (`doW`, great/small-circle front/back split, `drawArc`) | `Circle` class + `pathArc` (quadratic-curve tessellation, π/4 step) |
| `CSLinesClass.update` (sphere + horizon clipping into above/below/front/back) | `Line.segments()` returning layered segments |
| `updateObjects*` depth sort | objects drawn in a back pass then a front pass by screen-z |
| Horizon plane clip (`_yscale = r·sin φ`, rotation `180+θ`) | the **true horizon circle** (alt = 0) is projected and filled (geometrically exact, avoids the scale/rotate ambiguity) |
| `onEnterFrame` + `getTimer()` | one `requestAnimationFrame` loop + `performance.now()`, same ms speed constants |
| Sphere `simple drag` (`updateSimpleDragging`) | pointer drag on the canvas + arrow-key rotation |
| `Sun Disk` drag (timeOfDay / dayOfYear) | pointer drag on the sun, same offset + equation-of-time correction; `analemma.setClosestDay` ported |
| `Analemma Curve` (60 sample points, intervals, nearest-day) | `analemma` object, ported including `setClosestDay` |

Colours are the original decimal-RGB ints (e.g. equator/prime-hour `2915326`
→ blue, ecliptic `16777215` → white, sun-declination circle `16773728` → yellow,
analemma `16720932` → red, horizon green `5358673`/`3843386`, sky `12575999`).
Alpha values are the original 0–100 divided by 100.

## Assets reused vs code-drawn

* **Reused exported bitmaps:**
  * `images/213.png` → `assets/worldmap.png` — the latitude-selector world map.
  * `sprites/DefineSprite_156_Stickfigure/1.png` → `assets/stickfigure.png` — the
    observer, drawn with `ctx.drawImage` at the sphere centre (not redrawn).
  * `sprites/DefineSprite_339_Sun Disk/1.png` and `…/2.png` →
    `assets/sun.png` / `assets/sun-hover.png` and the shadow bitmap are copied in
    for reuse as well.
* **Code-drawn (no standalone exported file — built at runtime in the AS):** the
  celestial-sphere circles, axis lines, sky/ground shading, sun disk, shadow,
  month labels, direction labels, and the analemma — reproduced with canvas 2D.
* **Reproduced to match the exported art:** the **Time Of Day Clock** is redrawn
  on a canvas to match the original 24-hour dial (hour numbers 1–23 bold every 3
  hours, the 12 am / 6 am / 12 pm / 6 pm labels, tick ring, gray hour + minute
  hands with an orange hub) because the exported sprite bitmap bakes in a hand at
  one position; redrawing lets the hands animate.

## contents.json

The shared foundation `contents.json` **already contained** a `"sunmotions"`
entry (meta.title "Sun Motions Simulator", version "2.0", with Help and About
text already reflowed from the original into the AAS boilerplate). The masthead is
referenced with `sim-id="sunmotions" json-url="foundation/contents.json"`.

### Required JSON-syntax repair (pre-existing corruption in the shared file)

The shared `contents.json` shipped as **invalid JSON**, so `JSON.parse` failed and
the `<kl-unl-masthead>` could not load **any** sim's title / Help / About (the
masthead silently rendered empty). These are pre-existing defects in the shared
file (other sims' entries), not in this sim's `sunmotions` entry. To make the
required masthead component work, the **local** `html5/foundation/contents.json`
copy was repaired with the minimal, content-preserving syntax fixes below — no
displayed text was changed:

* Unescaped raw newlines inside string values (split content strings) in the
  `ce_hc`, eclipsing-binary (`These data were … provided by`), a Wien/Stefan-
  Boltzmann nail-demo entry, and a moon/horizon demo entry → joined onto one line.
* Unescaped `"` inside `<a href="…">` links in the Venus-phases (`ptolemaic` /
  `venusphases`) entries → escaped as `\"`.
* A raw tab character inside a pulsar-demo string → replaced with a space.

**Action for the user:** the *source* shared `foundation/contents.json` (and the
copies in the other sim folders) have the same corruption and should be fixed
upstream — every sim built on this foundation has a broken masthead until then.

## Clock and day-of-year slider — design adopted from the Big Dipper Clock sim

At the user's request the **analog clock** and the **day-of-year slider** use the
design from the sibling Big Dipper Clock conversion:
* Clock: a 24-hour dial drawn on canvas — hours 0–23 (0 at top, bold every 3
  hours), a double outer ring, 12 am / 6 am / 12 pm / 6 pm labels, and tailed
  hour + minute hands (hour hand one turn per day).
* Day-of-year: an accessible `role="slider"` strip with the month names **inside**
  the bar, divider lines at month boundaries, and a draggable downward-triangle
  cursor; full keyboard support (arrows ±1, PageUp/Down ±7, Home/End) and
  click-to-jump on the strip.

The **latitude world map** uses the **Heliacal Rising Simulator** design: the
exported `worldmap.png` as an `<img>` with an overlaid horizontal red latitude
line (`role="slider"`, outward arrowheads) that drags vertically; full keyboard
support (arrows ±0.1°, PageUp/Down ±1°, Home/End = ±90°).

## Deviations from the original (and why)

1. **No MathJax / no equations.** The original sim displays **no mathematical
   equations** — only numeric readouts with simple unit symbols (°, h, m). The
   KL-UNL foundation ships **no** MathJax (its `kl-unl.js` only typesets *if*
   `window.MathJax` exists), and the self-contained rule forbids a CDN.
   Additionally, the readouts update every animation frame, so per-frame MathJax
   typesetting would be a serious performance problem. Readouts are therefore
   rendered as accessible HTML text with full spoken units (see ACCESSIBILITY.md).
   No math content is drawn on the canvas. *(Priority: behavior + self-contained
   over the blanket MathJax rule, which has nothing to typeset here.)*
2. **Controls match the original layout, with shared cross-sim component designs.**
   Time of day = an **hour** box and a **minute** box (type to set) plus the
   draggable 24-hour analog clock. Observer's latitude = a **latitude** box plus a
   **N/S hemisphere `<select>`** (matching the Heliacal Rising sim), plus the world
   map. Day of year = month `<select>` + day box + the day-of-year strip slider.
   All entry boxes share the foundation `.control-row__input` sizing (0.95rem font,
   ~2.15rem tall) so they look identical across sims; numeric boxes share one
   width. Layout: left column (diagram + info) 40%, right column (controls) 60%,
   with column spacing; the two control panels are equal width. All controls are
   keyboard operable and the live region speaks full units.
3. **Sky / twilight shading is simplified.** The original composited six masked
   gradient layers (inner/outer × front/back × above/below). The port reproduces
   the visible result — a sun-altitude-driven blue sky dome (`skyBack` alpha
   `80·(alt/90)^0.15`) and a twilight/night darkening (`horizonShade` alpha
   `min(40, 40·(1−alt/90)^4)`) — as two tints around the projected horizon plane,
   rather than the full six-layer mask stack. Geometry and physics are unchanged.
4. **Stick figure / shadow** are drawn as a simple figure and shadow rather than
   reproducing the exported `Stickfigure` symbol art (which is decorative); the
   shadow direction/visibility still follow the sun.
5. **Animation in a headless preview.** `requestAnimationFrame` is throttled in
   headless capture environments, so automated screenshots can't show motion; in a
   real browser the animation runs. The stepping logic is a direct port of
   `onEnterFrameFunc` (continuous / loop-day / step-by-day) with the original ms
   speed constants.

Nothing in the underlying physics/logic was changed to satisfy presentation or
accessibility — only how it is displayed and operated.
