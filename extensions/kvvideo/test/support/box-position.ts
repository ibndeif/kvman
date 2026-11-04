import { execFileSync } from 'node:child_process';

// Where a white box sits on a dark page, read back with the ffmpeg on the PATH: the middle of the white run along
// one row of a picture (a video at a time, or an image), at the picture's own width, or undefined when there is none.

export const slidingBox = (seconds: number): string => `<!doctype html><html><head><style>
body { margin: 0; background: #000; }
#box { position: absolute; top: 100px; left: 0; width: 100px; height: 100px; background: #fff; animation: slide ${String(seconds)}s linear both; }
@keyframes slide { from { transform: translateX(0); } to { transform: translateX(${String(seconds * 600)}px); } }
</style></head><body><div id="box"></div></body></html>`;

export function boxCenter(file: string, row: number, width: number, seconds?: number): number | undefined {
  const at = seconds === undefined ? [] : ['-ss', seconds.toFixed(3)];
  const raw = execFileSync('ffmpeg', ['-v', 'error', ...at, '-i', file, '-frames:v', '1', '-vf', `scale=${String(width)}:-2,crop=${String(width)}:1:0:${String(row)}`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-']);
  const white = [...raw].flatMap((value, x) => (value > 128 ? [x] : []));
  if (white.length === 0) return undefined;
  return ((white[0] ?? 0) + (white.at(-1) ?? 0)) / 2;
}

export function pictureSize(file: string): string {
  return execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=s=x:p=0', file], { encoding: 'utf8' }).trim();
}
