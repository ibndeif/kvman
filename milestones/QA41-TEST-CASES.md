# QA 41 — A turn has no step limit by default (ADR 0029)

Asked: "I got this 'The turn stopped after 50 steps' while turns are unlimited".

M2.4-E18 still holds: with `kvcoder.maxSteps` a number, the turn ends `maxSteps` at it.

## Happy path

- **QA41-H1 The default is no limit.** *Given* kvcoder with no settings, *then* `kernel.settings.list` has `kvcoder.maxSteps` with the value `null`. `extensions/kvcoder/test/turn-limits.test.ts`
- **QA41-H2 A turn goes past 50 steps.** *Given* no settings and a model that makes one call in each of 51 steps and then answers, *when* a message is sent, *then* the model was asked 52 times, the turn's outcome is `done` with `steps: 52`, the session is `idle`, and the chat has no notice. `extensions/kvcoder/test/turn-limits.test.ts`
- **QA41-H3 Clearing the number removes the limit.** *Given* `kvcoder.maxSteps` set to 2 and then to `null` with `kernel.settings.set`, *when* a turn makes three calls and then answers, *then* its outcome is `done` with `steps: 4`. `extensions/kvcoder/test/turn-limits.test.ts`
- **QA41-H4 The form says how to have no limit.** *Then* the text of `kvcoder.maxSteps.description` is, in `en`, "The most steps a turn takes before it stops. Leave it empty for no limit.", and the `ar` entry differs from the `en` one and isn't empty. `extensions/kvcoder/test/locales.test.ts`

## Edge cases

- **QA41-E1 Only a positive whole number or `null` is a value.** *Then* `kernel.settings.set` of `kvcoder.maxSteps` to `0`, `-1`, `1.5`, and `'x'` each fails `VALIDATION_FAILED`, and to `1` and to `null` each succeeds. `extensions/kvcoder/test/turn-limits.test.ts`
