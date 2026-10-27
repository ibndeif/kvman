import type { Page } from 'playwright-core';
import { centerOf, glideTo, type Pointer } from './pointer.ts';
import type { Step } from './steps.ts';

// What each step does on the page (plan 16 §16.5). It answers where the mouse is afterwards.

const scrollStep = 100;

async function scroll(page: Page, pixels: number): Promise<void> {
  let left = pixels;
  while (left !== 0) {
    const part = Math.sign(left) * Math.min(scrollStep, Math.abs(left));
    await page.mouse.wheel(0, part);
    await page.waitForTimeout(30);
    left -= part;
  }
}

export async function runStep(page: Page, step: Step, pointer: Pointer): Promise<Pointer> {
  switch (step.do) {
    case 'goto':
      await page.goto(step.url, { waitUntil: 'load', timeout: 30_000 });
      return pointer;
    case 'click': {
      const at = await glideTo(page, pointer, await centerOf(page, step.target));
      await page.mouse.click(at.x, at.y);
      return at;
    }
    case 'type': {
      const at = await glideTo(page, pointer, await centerOf(page, step.target));
      await page.mouse.click(at.x, at.y);
      await page.keyboard.type(step.text, { delay: 50 });
      return at;
    }
    case 'press':
      await page.keyboard.press(step.key);
      return pointer;
    case 'hover':
      return glideTo(page, pointer, await centerOf(page, step.target));
    case 'scroll':
      await scroll(page, step.pixels);
      return pointer;
    case 'wait':
      await page.waitForTimeout(step.ms);
      return pointer;
    case 'waitFor':
      await page.locator(step.target).first().waitFor({ state: 'visible', timeout: 10_000 });
      return pointer;
  }
}

/** Whether the page is held a moment after the step, so the viewer sees what it did. */
export function pausesAfter(step: Step): boolean {
  return step.do !== 'wait' && step.do !== 'waitFor';
}
