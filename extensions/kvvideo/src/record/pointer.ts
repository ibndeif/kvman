import type { Page } from 'playwright-core';
import { frameMs, glidePath, type Point } from './motion.ts';
import type { Box } from './steps.ts';

// The mouse as the viewer sees it (plan 16 §16.5; ADR 0115, 9): it glides to each target along an eased, gently
// curved path, one move a frame, so the drawn pointer travels instead of jumping.

export async function glideTo(page: Page, from: Point, to: Point): Promise<Point> {
  for (const point of glidePath(from, to)) {
    await page.mouse.move(point.x, point.y);
    await page.waitForTimeout(frameMs);
  }
  return to;
}

/** The box of the first visible match of a target, scrolled into view, in whole CSS pixels of the viewport. */
export async function targetBox(page: Page, target: string): Promise<Box> {
  const element = page.locator(target).first();
  await element.waitFor({ state: 'visible', timeout: 10_000 });
  await element.scrollIntoViewIfNeeded({ timeout: 10_000 });
  const box = await element.boundingBox({ timeout: 10_000 });
  if (box === null) throw new Error(`${target} has no box on the page`);
  return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) };
}

export function centerOf(box: Box): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
