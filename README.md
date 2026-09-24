# Crayon melt

A small offline canvas toy. Draw with a crayon; the wax thickens and starts to drip two seconds after you let go. Clear the paper and start over.

[Try it online](https://crayon-melt.vercel.app/).

## Run

Open `index.html` in a browser, or serve this folder with `python3 -m http.server 8000` and visit `http://localhost:8000`. No build step, network request, or dependency is required.

Mouse, pen, and touch input use pointer events. Choose a color at the bottom of the paper and use **Clear** to reset it.

## Physics knobs

Edit `PHYSICS` at the top of [`script.js`](script.js):

| Knob | Default | Effect |
| --- | ---: | --- |
| `meltDelayMs` | `2000` | Pause after a stroke ends before it softens. |
| `gravity` | `58` | Downward acceleration of each drip, in px/s². |
| `maxDripLength` | `175` | Maximum drip reach before the paper edge clamps it. |
| `meltDurationMs` | `7800` | How long the canvas redraws while wax moves. |
| `dripSpacing` | `34` | Distance along a stroke between drip anchors. |
| `waxWidth` | `13` | Width of a fresh crayon mark. |
| `massGain` | `9` | Extra width as the mark warms. |

Wax marks combine a translucent core with deterministic grain flakes. After the delay, each finished stroke grows a thicker body; individual drips accelerate under gravity, bend slightly, and stop at their own length or the paper edge. The canvas redraws only while wax is moving or being drawn.

## Demo

[`demo/play-session.mp4`](demo/play-session.mp4) is one continuous browser play session showing drawing, melting, clearing, and drawing again. Its soundtrack uses the first 34.875 seconds of [“Sounds Good” by Michael Ramir C.](https://mixkit.co/free-stock-music/funk/) under the [Mixkit Stock Music Free License](https://mixkit.co/license/modal/musicFree/).
