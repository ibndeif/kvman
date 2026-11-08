# Tutorials of an app or a website

Read this at the concept of a tutorial.

## The script

- One section per real step the viewer will take, named by its outcome: "Add a patient", "Save the visit".
- Narrate the intent and the effect, not the pointer: "Save the visit so the doctor sees it", not "Click the blue button".
- Say what, then why, in a sentence or two, and name buttons and fields exactly as the app writes them.
- Open with the result the viewer will get (shown first when it can be seen), and end with what to do next.

## Attention

- Each action lands on its words, with `atLine`.
- At most two attention cues on screen at once. Mark the action just before it happens, and remove the mark soon after. Use a callout or a highlight, not both on the same thing, and only where the eye would get lost: not every click needs one.
- Leave about 2 seconds between groups of steps, so the camera eases back out and the viewer sees the whole page again before the next close-up.
- Blur personal data, and use clean demo data.

## Pace

- No waiting on screen. Use `waitFor` for what a step needs before the step that shows it, and cut a long wait out by splitting the recording into two scenes with `from` and `to`, joined with a `cut`.
- Hold the result of each step at normal pace, long enough to see that it worked.
- Type only what the viewer needs to see typed, and keep it short.

## Shapes

A wide app rarely survives 9:16. When the app has a phone layout, record it again as a phone (`device: 'phone'`); otherwise deliver landscape only, or make a shorter vertical cut with one step per scene. Say which in the treatment.
