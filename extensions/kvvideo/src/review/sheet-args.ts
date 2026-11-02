// ffmpeg's arguments for one contact sheet (plan 16 §16.10; ADR 0115, 48): each frame taken at its time, 480 px on its
// longer side, labelled with its time (`m:ss.s`) in the bundled font, laid out 3 frames wide, as a JPEG. ffmpeg runs in
// the work folder, where the font is `font.ttf`.

export type Tile = { width: number; height: number };

const even = (value: number): number => Math.max(2, 2 * Math.round(value / 2));

/** A frame's size on the sheet, for a video of `width` × `height`. */
export function tileOf(width: number, height: number): Tile {
  return width >= height ? { width: 480, height: even((480 * height) / width) } : { width: even((480 * width) / height), height: 480 };
}

/** A time as the sheet labels it, `m:ss.s`. */
export function timeLabel(ms: number): string {
  const tenths = Math.floor(ms / 100);
  return `${String(Math.floor(tenths / 600))}:${String(Math.floor(tenths / 10) % 60).padStart(2, '0')}.${String(tenths % 10)}`;
}

export function sheetGraph(times: readonly number[], tile: Tile): string {
  const tiles = times.map((at, index) => `[${String(index)}:v]scale=${String(tile.width)}:${String(tile.height)},drawtext=fontfile=font.ttf:text='${timeLabel(at).replace(':', '\\:')}':x=10:y=h-th-10:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=6[t${String(index)}]`);
  const labels = times.map((_, index) => `[t${String(index)}]`).join('');
  const layout = times.map((_, index) => `${String((index % 3) * tile.width)}_${String(Math.floor(index / 3) * tile.height)}`).join('|');
  const stack = times.length === 1 ? `${labels}null[sheet]` : `${labels}xstack=inputs=${String(times.length)}:layout=${layout}:fill=black[sheet]`;
  return [...tiles, stack].join(';\n');
}

export function sheetArgs(video: string, times: readonly number[], graph: string, output: string): string[] {
  return ['-hide_banner', '-loglevel', 'error', ...times.flatMap((at) => ['-ss', (at / 1000).toFixed(3), '-i', video]), '-filter_complex_script', graph, '-map', '[sheet]', '-frames:v', '1', '-q:v', '4', '-y', output];
}
