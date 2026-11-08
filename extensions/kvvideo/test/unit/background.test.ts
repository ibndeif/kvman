import { describe, expect, it } from 'vitest';
import { backgroundFit, backgroundInput, backgroundOf, mixed } from '../../src/compose/background.ts';

const brand = { logo: null, colors: { primary: '#0066ff', background: '#ffffff', text: '#111111' }, font: null };
const size = { width: 1920, height: 1080 };

describe("a scene's background (16 §16.8, ADR 0115, 10 and 60)", () => {
  it('M5.7-H6 QA79-E3 an image, a colour, the brand, and the default, each drawn by ffmpeg with no motion', () => {
    expect(mixed('#ffffff', '#0066ff', 0.18)).toBe('#d1e3ff');
    expect(backgroundOf({ file: '/w/bg.png' }, brand)).toEqual({ kind: 'image', file: '/w/bg.png' });
    expect(backgroundOf({ colour: '#112233' }, null)).toEqual({ kind: 'gradient', from: '#112233', to: '#112233' });
    expect(backgroundOf({ colour: '#112233' }, brand)).toEqual({ kind: 'gradient', from: '#112233', to: mixed('#112233', '#0066ff', 0.18) });
    expect(backgroundOf(undefined, brand)).toEqual({ kind: 'gradient', from: '#ffffff', to: '#d1e3ff' });
    expect(backgroundOf(undefined, null)).toEqual({ kind: 'gradient', from: '#0F172A', to: '#1E293B' });
    expect(backgroundInput({ kind: 'gradient', from: '#0F172A', to: '#1E293B' }, size, 2500)).toEqual(['-f', 'lavfi', '-t', '2.500', '-i', 'gradients=s=1920x1080:r=60:c0=0x0F172A:c1=0x1E293B:x0=0:y0=0:x1=1920:y1=1080:n=2,trim=end_frame=1,loop=loop=-1:size=1']);
    expect(backgroundInput({ kind: 'image', file: '/w/bg.png' }, size, 2500)).toEqual(['-loop', '1', '-framerate', '60', '-t', '2.500', '-i', '/w/bg.png']);
    expect(backgroundFit({ kind: 'image', file: '/w/bg.png' }, size)).toBe('scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=60,format=yuv420p');
    expect(backgroundFit({ kind: 'gradient', from: '#000000', to: '#000000' }, size)).toBe('fps=60,format=yuv420p');
  });
});
