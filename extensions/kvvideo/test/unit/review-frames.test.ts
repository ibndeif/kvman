import { describe, expect, it } from 'vitest';
import { frameTimes, sheetsOf } from '../../src/review/frames.ts';
import { sheetGraph, tileOf, timeLabel } from '../../src/review/sheet-args.ts';

const sidecar = {
  kind: 'video' as const,
  durationMs: 9000,
  width: 1920,
  height: 1080,
  scenes: [{ startMs: 0, endMs: 3000 }, { startMs: 2500, endMs: 6000 }, { startMs: 5500, endMs: 9000 }],
  captions: [{ text: 'a', startMs: 300, endMs: 1300 }, { text: 'b', startMs: 1300, endMs: 2600 }, { text: 'c', startMs: 2800, endMs: 4000 }, { text: 'd', startMs: 5800, endMs: 8800 }],
};

describe("review's frames and sheets (16 §16.10, ADR 0115, 48)", () => {
  it('M5.9-H5 the scenes, the transitions, and the captions, none within 500 ms, else every 5 s', () => {
    expect(frameTimes(sidecar, 9000)).toEqual([800, 1500, 2900, 3400, 4250, 5900, 7250]);
    expect(frameTimes(undefined, 12_000)).toEqual([0, 5000, 10_000]);
    const many = frameTimes({ ...sidecar, durationMs: 200_000, scenes: Array.from({ length: 150 }, (_, index) => ({ startMs: index * 1000, endMs: index * 1000 + 1000 })), captions: [] }, 200_000);
    expect(many).toHaveLength(96);
    expect(many[0]).toBe(500);
    expect(many.at(-1)).toBe(149_400);
    expect(sheetsOf(many).map((sheet) => sheet.length)).toEqual([12, 12, 12, 12, 12, 12, 12, 12]);
    expect(sheetsOf([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]).map((sheet) => sheet.length)).toEqual([12, 1]);
  });

  it('M5.9-H5 a sheet: 480 px frames labelled with their time, three wide', () => {
    expect([tileOf(1920, 1080), tileOf(1080, 1920)]).toEqual([{ width: 480, height: 270 }, { width: 270, height: 480 }]);
    expect([timeLabel(0), timeLabel(65_430), timeLabel(600_000)]).toEqual(['0:00.0', '1:05.4', '10:00.0']);
    const lines = sheetGraph([0, 1000, 2000, 3000], { width: 480, height: 270 }).split(';\n');
    expect(lines[1]).toBe("[1:v]scale=480:270,drawtext=fontfile=font.ttf:text='0\\:01.0':x=10:y=h-th-10:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=6[t1]");
    expect(lines[4]).toBe('[t0][t1][t2][t3]xstack=inputs=4:layout=0_0|480_0|960_0|0_270:fill=black[sheet]');
    expect(sheetGraph([0], { width: 480, height: 270 })).toContain('[t0]null[sheet]');
  });
});
