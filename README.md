# Sun Motions Simulator — HTML5

Accessible HTML5 rebuild of the NAAP / University of Nebraska–Lincoln
**Motions of the Sun Simulator** (originally Adobe Flash, `sunMotions068`).

## This sim must be served over HTTP — it will **not** run from a double-clicked `file://` path.

The KL-UNL masthead component (`foundation/kl-unl-masthead.js`) loads its title,
Help and About text with `fetch('foundation/contents.json')`. Browsers block
`fetch()` of local files under the `file://` protocol (same-origin policy), so if
you open `index.html` by double-clicking it, the masthead (title bar + Reset /
Help / About) will be empty or broken. Served over HTTP the fetch succeeds and the
simulator loads normally.

## How to run locally

Run one of these from **inside the `html5/` folder**, then open the printed URL:

```
# Python 3
python3 -m http.server 8123
#   then open  http://localhost:8123/

# Node
npx serve
#   (or)  npx http-server

# VS Code
#   Use the "Live Server" extension and "Open with Live Server".
```

Because you are serving from inside `html5/`, the simulator is at the **server
root** — the URL is `http://localhost:8123/`, not `http://localhost:8123/html5/index.html`.

## Production

When deployed to the cloud host (served over HTTP/HTTPS) it just works. The
`file://` limitation only affects opening the local file directly by double-click.

## Files

```
html5/
  index.html          KL-UNL scaffold: .app-shell + <kl-unl-masthead> + panels
  foundation/         KL-UNL foundation, copied UNCHANGED (kl-unl-masthead.js,
                      kl-unl.css, kl-unl.js, contents.json, README.md).
                      Only contents.json carries this sim's pre-existing
                      "sunmotions" entry (it was already present; nothing edited).
  styles/styles.css   sim-specific styles only (canvas, clock, map, ticks, grids)
  simulation.js       all sim logic (astronomy + 3D engine + controls)
  assets/worldmap.png exported world-map bitmap reused for the latitude selector
  CONVERSION_NOTES.md  behavior model, AS->HTML5 mapping, deviations
  ACCESSIBILITY.md     WCAG affordances, keyboard map, ARIA, live-region wording
```

No build step, no bundler, no framework, no CDN, no analytics — everything is
local and vanilla HTML/CSS/JS (ES modules).
