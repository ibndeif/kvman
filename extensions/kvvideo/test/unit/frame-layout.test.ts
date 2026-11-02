import { describe, expect, it } from 'vitest';
import { phoneLayout, windowLayout } from '../../src/compose/frame-layout.ts';

const picture = { width: 1920, height: 1080 };

describe("a clip's frame (16 §16.8, ADR 0115, 10)", () => {
  it('M5.7-H5 a window keeps the clip shape inside its margins, larger at the bottom with bottom captions', () => {
    const bottom = windowLayout(picture, { width: 2560, height: 1440 }, true);
    expect(bottom.screen.height).toBe(Math.round((1080 - 64.8 - 151.2) / 2) * 2);
    expect(bottom.screen.width / bottom.screen.height).toBeCloseTo(16 / 9, 2);
    expect(bottom.screen.y).toBeGreaterThanOrEqual(65);
    expect(1080 - bottom.screen.y - bottom.screen.height).toBeGreaterThanOrEqual(151);
    expect(bottom.screen.x * 2 + bottom.screen.width).toBeCloseTo(1920, -1);
    expect([bottom.radius, bottom.shadow]).toEqual([16, { offset: 22, blur: 54 }]);
    const top = windowLayout(picture, { width: 2560, height: 1440 }, false);
    expect(top.screen.height).toBe(950);
    expect(top.screen.y).toBe(65);
    expect(top.screen.width % 2 + top.screen.height % 2).toBe(0);
  });

  it('M5.7-H5 a phone is 88% of the picture high, its screen inside its outline', () => {
    const phone = phoneLayout(picture, { width: 780, height: 1688 });
    expect(phone.body.height).toBe(950);
    expect(phone.screen.x).toBeGreaterThan(phone.body.x);
    expect(phone.screen.y).toBeGreaterThan(phone.body.y);
    expect(phone.screen.x + phone.screen.width).toBeLessThanOrEqual(phone.body.x + phone.body.width + 1);
    expect(phone.screen.width / phone.screen.height).toBeCloseTo(780 / 1688, 2);
    expect(phone.radius).toBeLessThan(phone.bodyRadius);
    const narrow = phoneLayout({ width: 320, height: 1080 }, { width: 780, height: 1688 });
    expect(narrow.body.width).toBeLessThanOrEqual(Math.ceil(320 * 0.88) + 1);
  });
});
