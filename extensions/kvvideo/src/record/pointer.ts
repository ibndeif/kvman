import type { Page } from 'playwright-core';

// The mouse as the viewer sees it (ADR 0107, 19): it glides to each target over 600 ms, in 30 moves, so the drawn
// cursor travels instead of jumping.

const glideMoves = 30;
const glideMs = 600;

export type Pointer = { x: number; y: number };

export async function glideTo(page: Page, from: Pointer, to: Pointer): Promise<Pointer> {
  for (let move = 1; move <= glideMoves; move += 1) {
    const share = move / glideMoves;
    await page.mouse.move(from.x + (to.x - from.x) * share, from.y + (to.y - from.y) * share);
    await page.waitForTimeout(glideMs / glideMoves);
  }
  return to;
}

/** The center of the first visible match of a target, scrolled into view. */
export async function centerOf(page: Page, target: string): Promise<Pointer> {
  const element = page.locator(target).first();
  await element.waitFor({ state: 'visible', timeout: 10_000 });
  await element.scrollIntoViewIfNeeded({ timeout: 10_000 });
  const box = await element.boundingBox({ timeout: 10_000 });
  if (box === null) throw new Error(`${target} has no box on the page`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
