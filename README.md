# Crayon melt

A small offline canvas toy. Draw with a crayon; wax starts to thicken and drip about two seconds after you draw it, even while you keep drawing. Move the canvas to keep drawing in any direction.

[Try it online](https://crayon-melt.vercel.app/).

## Run

Open `index.html` in a browser, or serve this folder with `python3 -m http.server 8000` and visit `http://localhost:8000`. No build step, network request, or dependency is required.

Mouse, pen, and touch input use pointer events. Choose one of 11 swatches or open the color wheel swatch to pick any color. Use **Erase marks** or **Erase drips** for the corresponding part of a drawing, or use **Clear** to reset everything. The circle and crosshair under the pointer show the selected tool's size and center. The Size slider adjusts the selected tool: crayons range from 5–32 canvas units, eraser radii from 5–40 canvas units. Each tool remembers its size, and existing strokes keep their width. The on-screen brush circle scales with zoom.

The Melt slider sets drip amount for the next stroke. At 0% the wax thickens without drips; at 50% it uses the defaults below; at 100% drips can reach twice as far and appear twice as often. Finished strokes keep the amount chosen when they began.

Scroll over the canvas to zoom around the pointer, or use the **−** and **+** buttons to zoom around the screen center. Zoom ranges from 25% to 400%. Select **Move canvas** and drag to pan with a mouse or touch. On desktop, Space-drag and middle-drag also pan without switching tools. Marks stay at their world positions as you move around.

## Physics knobs

Edit `PHYSICS` at the top of [`script.js`](script.js):

| Knob | Default | Effect |
| --- | ---: | --- |
| `meltDelayMs` | `2000` | Pause after a mark is drawn before it softens. |
| `gravity` | `42` | Downward acceleration of each drip, in px/s². |
| `maxDripLength` | `105` | Base maximum drip reach at 50% Melt. |
| `massWarmupMs` | `1100` | Time for an older mark to reach full thickness. |
| `dripSpacing` | `52` | Base distance between drip anchors at 50% Melt. |
| `waxWidth` | `13` | Default width of a fresh crayon mark. |
| `massGain` | `9` | Extra width as the mark warms. |
| `eraserRadius` | `16` | Default radius of each eraser brush. |

Wax marks combine a translucent core with deterministic grain flakes. Older parts of a stroke gain mass while newer parts stay fresh; each drip uses the age of its own mark, accelerates under gravity, bends slightly, and stops at its own length. Erasing a mark before it melts prevents drips from starting there. The drip eraser removes only the pixels it covers and holds the touched drip at that length. The canvas redraws while wax moves or the user draws or erases.

The visible canvas is capped at three million backing pixels; finished marks use small per-stroke rasters instead of one giant world bitmap. Offscreen strokes are skipped during drawing, and animation stops when wax settles.

## Demo

[`demo/play-session.mp4`](demo/play-session.mp4) is one continuous browser play session showing drawing while wax melts, both erasers, Melt and Size controls, moving the canvas, clearing, and drawing again. Its soundtrack uses the first 36.875 seconds of ["Sounds Good" by Michael Ramir C.](https://mixkit.co/free-stock-music/funk/) under the [Mixkit Stock Music Free License](https://mixkit.co/license/modal/musicFree/).

## Contributing

Open an issue for bugs or small feature ideas. For code changes, keep the app dependency-free, run `node --check script.js`, and test drawing, both erasers, Melt levels, zoom, and panning in a browser at desktop and phone widths.

## License

The source code and documentation are [MIT licensed](LICENSE). The demo soundtrack is licensed separately by Mixkit as noted above; the MIT license does not apply to it.
