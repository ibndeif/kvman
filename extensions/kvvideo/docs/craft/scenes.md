# Scenes

Read this before the treatment's scene table, and before building an HTML scene.

## Choose each scene's pattern

Name the pattern in the scene's row. Patterns that work:

- **Title**: a few large words and one strong visual.
- **Big number**: one figure that counts up (`kv-count`), its meaning in a short line, and what it compares with.
- **Building diagram**: an empty frame that gains each part as the narration names it, with lines drawing between them (`kv-draw`).
- **Side by side**: before and after, old and new, or the idea beside its everyday analogy.
- **Timeline or steps**: points along a line that light up in order.
- **Zoom into a detail**: the whole system first, then one part large.
- **Chart**: read `video craft { topic: 'charts' }` first.
- **Code or terminal**: lines that type on in time with the narration, with the key line highlighted.
- **Quote or proof**: the source's own words, with its name.
- **The product**: the person's app or site, recorded, in a `window` or `phone` frame, with callouts.
- **End card**: the core message, the logo, the next step, and the credits.

Use at least three patterns in a video, and never the same one more than three scenes in a row.

## Compose the frame

- A video frame is not a web page. Fill it: the main element spans 60 to 80% of the frame's width.
- Every scene has three layers: a background with texture (a soft radial glow, very large faded words, a grid, grain), the content, and small accents (rules, labels, numbers, dividers). A flat empty background reads as a page that hasn't loaded.
- One main focus, and a second element for the eye to travel to. The most important thing is the largest and moves first.
- Anchor content to the edges, or split the frame (a panel on one side and the content on the other; a top bar, then the full width). Avoid stacking everything in the centre.
- A busy scene holds 8 to 10 visible elements, two of them decorative; a key moment holds fewer, larger ones.
- Keep words and key content inside the middle 90% of the frame. In a 9:16 frame, also keep them out of the bottom 20% and the top 10%, where phone apps draw their buttons and names.

## Size for video

A page is recorded at one size and shown at another, so measure in the frame's height (`vh`):

| Element | Size |
|---|---|
| Headline | 6 to 11 vh |
| Body text | 2.6 to 4 vh |
| Label | at least 1.8 vh |
| Border or rule | 0.2 to 0.4 vh |
| Padding | 5 to 13 vh |

Nothing under 2.2 vh without a reason. Decoration under 10% opacity disappears in the video.

## Colour

- Use the brand's colours from `kvvideo/brand.css` at video strength: the accent at full saturation on focal elements, and at 15 to 25% for atmosphere.
- Tint greys and blacks toward the brand's hue; avoid pure `#000` and `#fff`.
- A light background needs stronger borders and some texture; a dark one carries glows well.
- On a dark background, use a radial glow, or a solid colour with a soft light, rather than a full-frame linear gradient, which shows bands after compression.

## Signs of a generic design

Question each of these before you use it: text filled with a gradient; purple-to-blue or neon-on-dark by default; rows of identical cards; a coloured stripe down the side of every card; everything centred with the same weight. Use one only when the content asks for it.

## Images and clips

Never show a raw flat image. Frame it (a `window` or `phone` frame, or a card with depth and a shadow), and let the camera move over it. Credit media from the web in the end card when its licence asks for it.
