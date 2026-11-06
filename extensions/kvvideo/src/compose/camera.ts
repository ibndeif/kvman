import type { Action, Box } from '../record/steps.ts';
import { videoFramesPerSecond } from './video-rate.ts';

// The camera (plan 16 §16.8; ADR 0115, 7, 34, 58, and 60). On a recorded website it zooms to each click and type:
// 1.6× (less for a large box, never below 1), centred on the box and kept inside the page, easing in from the step's
// start until it acts; a stop within 2.5 s of the last one's end is reached by panning over 600 ms; 1.5 s after a
// run's last stop the view eases out over 800 ms. An image zooms from 1× to 1.08× at an even pace over its scene, and a
// recorded page pushes in from 1× to 1.05× (ADR 0120, 1). The
// plan is drawn with ffmpeg's `perspective`, evaluated each frame from the frame's number.

export type View = { x: number; y: number; zoom: number };

/** One move of the view, from its start to its end. */
export type Shot = { startMs: number; endMs: number; from: View; to: View; easing: 'cubic' | 'even' };

export type CameraPlan = { width: number; height: number; start: View; shots: Shot[] };

const maximumZoom = 1.6;
const panMs = 600;
const runGapMs = 2500;
const holdMs = 1500;
const outMs = 800;
const leastInMs = 400;

const whole = (width: number, height: number): View => ({ x: width / 2, y: height / 2, zoom: 1 });

function stopView(box: Box, width: number, height: number): View {
  const zoom = Math.max(1, Math.min(maximumZoom, (0.8 * width) / box.width, (0.8 * height) / box.height));
  const keep = (center: number, side: number): number => Math.min(Math.max(center, side / (2 * zoom)), side - side / (2 * zoom));
  return { x: keep(box.x + box.width / 2, width), y: keep(box.y + box.height / 2, height), zoom };
}

/** The camera of a recording of `width` × `height` CSS pixels, from its actions. */
export function cameraOfActions(actions: readonly Action[], width: number, height: number): CameraPlan {
  const start = whole(width, height);
  const shots: Shot[] = [];
  let current = start;
  let lastEndMs: number | undefined;
  const easeOut = (endMs: number): void => {
    shots.push({ startMs: endMs + holdMs, endMs: endMs + holdMs + outMs, from: current, to: start, easing: 'cubic' });
    current = start;
  };
  for (const action of actions) {
    if ((action.do !== 'click' && action.do !== 'type') || action.box === undefined || action.actMs === undefined) continue;
    const target = stopView(action.box, width, height);
    if (lastEndMs !== undefined && action.atMs - lastEndMs <= runGapMs) {
      shots.push({ startMs: action.atMs, endMs: action.atMs + panMs, from: current, to: target, easing: 'cubic' });
    } else {
      if (lastEndMs !== undefined) easeOut(lastEndMs);
      shots.push({ startMs: action.atMs, endMs: Math.max(action.actMs, action.atMs + leastInMs), from: current, to: target, easing: 'cubic' });
    }
    current = target;
    lastEndMs = action.endMs;
  }
  if (lastEndMs !== undefined) easeOut(lastEndMs);
  return { width, height, start, shots };
}

/** A recorded page's slow push-in (ADR 0120, 1): 1× to 1.05×, centred, even, over the scene's part of the recording. */
export function pagePushIn(width: number, height: number, fromMs: number, lengthMs: number): CameraPlan {
  const start = whole(width, height);
  return { width, height, start, shots: [{ startMs: fromMs, endMs: fromMs + lengthMs, from: start, to: { ...start, zoom: 1.05 }, easing: 'even' }] };
}

/** An image's slow zoom over `lengthMs`; its size is the input's, read by ffmpeg. */
export function imageZoom(lengthMs: number): CameraPlan {
  return { width: 1, height: 1, start: whole(1, 1), shots: [{ startMs: 0, endMs: lengthMs, from: whole(1, 1), to: { ...whole(1, 1), zoom: 1.08 }, easing: 'even' }] };
}

const cubic = (share: number): number => (share < 0.5 ? 4 * share ** 3 : 1 - (-2 * share + 2) ** 3 / 2);

/** The view at `ms`. */
export function viewAt(plan: CameraPlan, ms: number): View {
  let view = plan.start;
  for (const shot of plan.shots) {
    if (ms < shot.startMs) break;
    if (ms >= shot.endMs) {
      view = shot.to;
      continue;
    }
    const share = (ms - shot.startMs) / (shot.endMs - shot.startMs);
    const eased = shot.easing === 'even' ? share : cubic(share);
    const between = (key: keyof View): number => shot.from[key] + (shot.to[key] - shot.from[key]) * eased;
    return { x: between('x'), y: between('y'), zoom: between('zoom') };
  }
  return view;
}

const number = (value: number): string => String(Math.round(value * 10_000) / 10_000);

// One part of the view (x, y, or zoom) as an ffmpeg expression of the time `T` in ms.
function partExpression(plan: CameraPlan, key: keyof View, time: string): string {
  let expression = number(plan.shots.at(-1)?.to[key] ?? plan.start[key]);
  for (let index = plan.shots.length - 1; index >= 0; index -= 1) {
    const shot = plan.shots[index];
    if (shot === undefined) continue;
    const before = number(plan.shots[index - 1]?.to[key] ?? plan.start[key]);
    const share = `((${time}-${number(shot.startMs)})/${number(shot.endMs - shot.startMs)})`;
    const eased = shot.easing === 'even' ? share : `if(lt(${share},0.5),4*pow(${share},3),1-pow(-2*${share}+2,3)/2)`;
    const moving = `(${number(shot.from[key])}+${number(shot.to[key] - shot.from[key])}*${eased})`;
    expression = `if(lt(${time},${number(shot.startMs)}),${before},if(lt(${time},${number(shot.endMs)}),${moving},${expression}))`;
  }
  return expression;
}

/**
 * The `perspective` filter that shows the plan's view of a frame `scale` times the plan's size, or of the input's own
 * size for an image's zoom. `offsetMs` is where the part starts in the recording; the frames are at 60 a second.
 */
export function perspectiveFilter(plan: CameraPlan, scale: number | 'input', offsetMs: number): string {
  const time = `(in*1000/${String(videoFramesPerSecond)}+${number(offsetMs)})`;
  const zoom = partExpression(plan, 'zoom', time);
  const [pageWidth, pageHeight] = scale === 'input' ? ['W', 'H'] : [number(plan.width * scale), number(plan.height * scale)];
  const factor = scale === 'input' ? 'W' : number(scale);
  const factorY = scale === 'input' ? 'H' : number(scale);
  const halfWidth = `(${pageWidth}/(2*${zoom}))`;
  const halfHeight = `(${pageHeight}/(2*${zoom}))`;
  const left = `clip(${partExpression(plan, 'x', time)}*${factor}-${halfWidth},0,${pageWidth}-2*${halfWidth})`;
  const top = `clip(${partExpression(plan, 'y', time)}*${factorY}-${halfHeight},0,${pageHeight}-2*${halfHeight})`;
  const right = `${left}+2*${halfWidth}`;
  const bottom = `${top}+2*${halfHeight}`;
  return `perspective=x0='${left}':y0='${top}':x1='${right}':y1='${top}':x2='${left}':y2='${bottom}':x3='${right}':y3='${bottom}':interpolation=cubic:sense=source:eval=frame`;
}
