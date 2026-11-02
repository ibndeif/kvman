import type { Page } from 'playwright-core';
import { frameMs, scrollPlan, typingDelays, type Point } from './motion.ts';
import { centerOf, glideTo, targetBox } from './pointer.ts';
import type { Box, Step } from './steps.ts';

// What each step does on the page (plan 16 §16.5). A step that acts on a target answers when it began to act (the
// pointer arrived, or the tap) and the target's box; on a phone the target is tapped, with no pointer to move.

export type StepState = { page: Page; device: 'desktop' | 'phone'; pointer: Point; elapsed(): number };

export type StepResult = { pointer: Point; act?: { atMs: number; box: Box } };

async function typeText(page: Page, text: string): Promise<void> {
  const delays = typingDelays(text);
  for (const [index, character] of [...text].entries()) {
    await page.waitForTimeout(delays[index] ?? 0);
    await page.keyboard.type(character);
  }
}

async function scroll(page: Page, pixels: number): Promise<void> {
  for (const move of scrollPlan(pixels).moves) {
    if (move !== 0) await page.mouse.wheel(0, move);
    await page.waitForTimeout(frameMs);
  }
}

// Brings the pointer or the finger to the target, and answers where it is and when it arrived.
async function reach(state: StepState, target: string): Promise<Required<StepResult>> {
  const box = await targetBox(state.page, target);
  const center = centerOf(box);
  if (state.device === 'phone') return { pointer: center, act: { atMs: state.elapsed(), box } };
  const pointer = await glideTo(state.page, state.pointer, center);
  return { pointer, act: { atMs: state.elapsed(), box } };
}

async function press(state: StepState, at: Point): Promise<void> {
  if (state.device === 'phone') await state.page.touchscreen.tap(at.x, at.y);
  else await state.page.mouse.click(at.x, at.y);
}

export async function runStep(state: StepState, step: Step): Promise<StepResult> {
  const { page } = state;
  switch (step.do) {
    case 'goto':
      await page.goto(step.url, { waitUntil: 'load', timeout: 30_000 });
      return { pointer: state.pointer };
    case 'click': {
      const reached = await reach(state, step.target);
      await press(state, reached.pointer);
      return reached;
    }
    case 'type': {
      const reached = await reach(state, step.target);
      await press(state, reached.pointer);
      await typeText(page, step.text);
      return reached;
    }
    case 'press':
      await page.keyboard.press(step.key);
      return { pointer: state.pointer };
    case 'hover':
      return reach(state, step.target);
    case 'scroll':
      await scroll(page, step.pixels);
      return { pointer: state.pointer };
    case 'wait':
      await page.waitForTimeout(step.ms);
      return { pointer: state.pointer };
    case 'waitFor':
      await page.locator(step.target).first().waitFor({ state: 'visible', timeout: 10_000 });
      return { pointer: state.pointer };
  }
}

/** Whether the page is held a moment after the step, so the viewer sees what it did. */
export function pausesAfter(step: Step): boolean {
  return step.do !== 'wait' && step.do !== 'waitFor';
}
