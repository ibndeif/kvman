# Charts

Read this before a scene that shows numbers.

## Choose the form

- **Fewer than three values**: a big-number scene, not a chart.
- **Categories compared**: bars, horizontal when the labels are long, sorted from the largest when it is a ranking.
- **A change over time**: a line.
- **Parts of a whole**: a donut of at most six slices, with the smallest joined as "Other".
- **A few key figures**: a grid of two to four numbers that count up.
- **Before and after**: two bars or two numbers, then the difference.
- **More than about twelve values**: keep the top five to seven and join the rest as "Other", or split them across scenes.

## Build it in time

- Draw it as SVG or canvas in the scene; no chart library is bundled. The frame and the axes come first, then the data over 2 to 4 seconds: bars grow from the baseline one after another, a line draws from left to right (`kv-draw`), slices fill clockwise from the top, and numbers count (`kv-count`).
- When the narration names a value, bring that one to full colour and slightly larger, and dim the rest.
- Hold the finished chart at least 3 seconds before the cut. When the narration moves on sooner, lengthen the scene or simplify the chart.

## Label it

- A title that says what it shows, the units, and the source in small text at the bottom.
- Values at the ends of the bars and at the ends of a line, not on every point; a donut's large slices labelled inside, its small ones outside with a line.
- At most five to seven bars, with labels as large as body text (see the scenes note).

## Stay true

Only real numbers from a source or the person. Bars start at zero. Round in the narration, and show the exact figure on screen.
