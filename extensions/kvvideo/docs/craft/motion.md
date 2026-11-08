# Motion

Read this before the style frames and before building an HTML scene. The kit's classes are in `kvvideo/motion.css`, and an element that comes in with caption line n has its `--at` at 300 ms plus that line's `startMs`.

## A scene in three parts

- **Build** (about the first third): elements enter one after another, the most important first, each starting before the last has finished; a group's entrances are all under way within about half a second.
- **Hold** (the middle): everything is in place, alive with one slow ambient motion, while the narration does the work.
- **Resolve** (the end): elements leave (`kv-out`) or settle before the cut, faster than they came in.

Nothing starts exactly at 0: the first entrance is 100 to 300 ms in.

## Name every element's motion

In the treatment's motion column, give each element a verb: drops, slides, wipes, draws, grows, counts up, types on, snaps, floats, drifts, pulses. An element without a verb isn't designed yet. Take the verb from what the scene says: a weight lands and drops, a step forward slides, a link draws, a total counts up.

## Vary it

- **Easing is the tone.** An entrance eases out (fast, then slowing); an exit eases in (slow, then gone); a move between two places eases in and out. Never linear.
- **Speed is weight.** 150 to 300 ms feels urgent, 300 to 500 ms is the default, 500 to 800 ms feels calm, and up to 2 s feels cinematic. Make the slowest motion in a video about three times the fastest.
- **Directions vary within a scene**: from the side, from below, a scale, a wipe, opacity alone. Not every element rises.
- **The rhythm differs from scene to scene**: another stagger, another ambient motion (`kv-drift`, `kv-float`, `kv-breathe`, `kv-spin`, or none), another emphasis.
- **Stillness is a tool.** After the key reveal, let the scene hold with one slow motion. Give a scene that must hold still `camera: 'none'` in `compose`; leave the slow push-in on the others.

## Stacking the kit's classes

An element takes one entrance, one ambient motion, one emphasis, and one exit at once. Entrances and emphases move `translate` and `scale`, ambient motions move `transform`, and any of them replaces the same property set by your own CSS while it runs. So don't place an element with `transform` (such as `translate(-50%, -50%)` to centre it) when it has an ambient motion: centre it with layout, or put the motion on a wrapper.

## Text

- Key phrases enter word by word (`kv-words`); a paragraph never fades in all at once.
- Numbers count (`kv-count`), lines and arrows draw (`kv-draw`), and one key word gets one emphasis (`kv-underline`, `kv-shine`, `kv-pulse`), not every word.
- Hold text long enough to read twice: about 15 characters a second, and never under 1.5 s.

## Transitions carry meaning

- `crossfade`: the same thought continues.
- `slide`: the next step of a sequence.
- `cut`: a change of register, a surprise, or a fast list, where half a second of transition would drag.
- `fade-black`: the end, or a long pause in a story.

Don't crossfade every scene.

## Sound

Cue sound with `data-sound` on the moments that matter (the key number, the logo, the main reveal), not on every entrance.

## 3D and scripts

Keep three.js for one hero moment in a video, with a slow camera move. Use anime.js or Lottie for what CSS can't draw. All of them run on kvvideo's clock, so they are exact at every frame.
