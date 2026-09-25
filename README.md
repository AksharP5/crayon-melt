# Crayon melt

A small offline canvas toy. Draw with a crayon; wax starts to thicken and drip about two seconds after you draw it, even while you keep drawing. Clear the paper and start over.

[Try it online](https://crayon-melt.vercel.app/).

## Run

Open `index.html` in a browser, or serve this folder with `python3 -m http.server 8000` and visit `http://localhost:8000`. No build step, network request, or dependency is required.

Mouse, pen, and touch input use pointer events. Choose a color at the bottom of the paper, select the eraser to rub out part of a drawing, or use **Clear** to reset it. The circle under the pointer shows the selected tool's size. The Size slider adjusts the selected tool: crayons range from 5–32 px, eraser radius from 8–60 px. Each tool remembers its size, and existing strokes keep their width.

## Physics knobs

Edit `PHYSICS` at the top of [`script.js`](script.js):

| Knob | Default | Effect |
| --- | ---: | --- |
| `meltDelayMs` | `2000` | Pause after a mark is drawn before it softens. |
| `gravity` | `58` | Downward acceleration of each drip, in px/s². |
| `maxDripLength` | `175` | Maximum drip reach before the paper edge clamps it. |
| `massWarmupMs` | `1100` | Time for an older mark to reach full thickness. |
| `dripSpacing` | `34` | Distance along a stroke between drip anchors. |
| `waxWidth` | `13` | Default width of a fresh crayon mark. |
| `massGain` | `9` | Extra width as the mark warms. |
| `eraserRadius` | `30` | Default radius of the eraser brush. |

Wax marks combine a translucent core with deterministic grain flakes. Older parts of a stroke gain mass while newer parts stay fresh; each drip uses the age of its own mark, accelerates under gravity, bends slightly, and stops at its own length or the paper edge. Erasing a drip removes only the touched section and holds its remaining wax at that length. The canvas redraws while wax moves or the user draws or erases.

The backing canvas is capped at three million pixels so large, high-density screens stay responsive. Animation stops when the wax reaches its final position.

## Demo

[`demo/play-session.mp4`](demo/play-session.mp4) is one continuous browser play session showing drawing while wax melts, partial erasing, clearing, resizing crayons, and drawing again. Its soundtrack uses the first 34.875 seconds of [“Sounds Good” by Michael Ramir C.](https://mixkit.co/free-stock-music/funk/) under the [Mixkit Stock Music Free License](https://mixkit.co/license/modal/musicFree/).
