import { describe, expect, it } from 'vitest';
import { cameraOfActions, imageZoom, perspectiveFilter, viewAt, type CameraPlan } from '../../src/compose/camera.ts';
import type { Action } from '../../src/record/steps.ts';
import { evaluateExpression } from '../support/ffmpeg-expression.ts';

const click = (atMs: number, actMs: number, endMs: number, box: Action['box']): Action => ({ do: 'click', atMs, actMs, endMs, box });

const evaluate = (expression: string, frame: number, size: { W: number; H: number }): number => evaluateExpression(expression, { in: frame, ...size });

function corners(filter: string): Record<string, string> {
  return Object.fromEntries([...filter.matchAll(/([xy][0-3])='([^']*)'/g)].map((match) => [match[1] ?? '', match[2] ?? '']));
}

describe('the camera (16 §16.8, ADR 0115, 7 and 34)', () => {
  const first = click(1000, 1600, 1650, { x: 100, y: 80, width: 40, height: 20 });
  const second: Action = { do: 'type', atMs: 3150, actMs: 3700, endMs: 4500, box: { x: 900, y: 500, width: 200, height: 30 } };
  const third = click(11_000, 11_500, 11_550, { x: 600, y: 300, width: 80, height: 40 });
  const plan = cameraOfActions([first, { do: 'wait', atMs: 2000, endMs: 3000 }, second, third], 1280, 720);

  it('M5.7-H1 it eases to each stop, pans within a run, and eases out after it', () => {
    expect(viewAt(plan, 0)).toEqual({ x: 640, y: 360, zoom: 1 });
    expect(plan.shots.map((shot) => [shot.startMs, shot.endMs])).toEqual([
      [1000, 1600],
      [3150, 3750],
      [6000, 6800],
      [11_000, 11_500],
      [13_050, 13_850],
    ]);
    const atFirst = viewAt(plan, 1600);
    expect(atFirst.zoom).toBe(1.6);
    expect([atFirst.x, atFirst.y]).toEqual([400, 225]);
    const atSecond = viewAt(plan, 4000);
    expect([atSecond.x, atSecond.y, atSecond.zoom]).toEqual([880, 495, 1.6]);
    expect(viewAt(plan, 6800)).toEqual({ x: 640, y: 360, zoom: 1 });
    const easing = viewAt(plan, 1300);
    expect(easing.zoom).toBeGreaterThan(1);
    expect(easing.zoom).toBeLessThan(1.6);
    expect(viewAt(plan, 1100).zoom - 1).toBeLessThan((viewAt(plan, 1300).zoom - 1) / 2);
  });

  it('M5.7-H2 a large box zooms less, and never below 1', () => {
    const wide = cameraOfActions([click(0, 500, 600, { x: 0, y: 0, width: 800, height: 100 })], 1280, 720);
    expect(wide.shots[0]?.to.zoom).toBe(1.28);
    const whole = cameraOfActions([click(0, 500, 600, { x: 0, y: 0, width: 1280, height: 720 })], 1280, 720);
    expect(whole.shots[0]?.to.zoom).toBe(1);
    const tapped = cameraOfActions([click(1000, 1000, 1000, { x: 0, y: 0, width: 10, height: 10 })], 390, 844);
    expect([tapped.shots[0]?.startMs, tapped.shots[0]?.endMs]).toEqual([1000, 1400]);
  });

  it('M5.7-H3 the perspective filter shows the planned view at 2x, frame by frame', () => {
    const filter = perspectiveFilter(plan, 2, 2000);
    expect(filter).toMatch(/:interpolation=cubic:sense=source:eval=frame$/);
    expect(filter).toContain('(in*1000/60+2000)');
    const exprs = corners(filter);
    for (const ms of [2000, 3400, 4000, 6400, 9000]) {
      const frame = ((ms - 2000) * 60) / 1000;
      const view = viewAt(plan, ms);
      const at = (key: string): number => evaluate(exprs[key] ?? '', frame, { W: 0, H: 0 });
      const width = (1280 * 2) / view.zoom;
      expect(at('x0')).toBeCloseTo(Math.min(Math.max(view.x * 2 - width / 2, 0), 2560 - width), 1);
      expect(at('x1') - at('x0')).toBeCloseTo(width, 1);
      expect(at('y2') - at('y0')).toBeCloseTo((720 * 2) / view.zoom, 1);
    }
  });

  it('M5.7-H4 an image zooms from 1 to 1.08 at an even pace, centred', () => {
    const zoom: CameraPlan = imageZoom(4000);
    expect(viewAt(zoom, 0).zoom).toBe(1);
    expect(viewAt(zoom, 2000).zoom).toBeCloseTo(1.04, 6);
    expect(viewAt(zoom, 4000).zoom).toBe(1.08);
    const exprs = corners(perspectiveFilter(zoom, 'input', 0));
    const size = { W: 1000, H: 500 };
    expect(evaluate(exprs['x0'] ?? '', 240, size)).toBeCloseTo(500 - 1000 / (2 * 1.08), 3);
    expect(evaluate(exprs['y3'] ?? '', 240, size)).toBeCloseTo(250 + 500 / (2 * 1.08), 3);
  });
});
