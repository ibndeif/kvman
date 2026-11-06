// kvvideo's clock (plan 16 §16.5; ADR 0120, 5, 16, 17, and 21), given to a page before its own scripts when the page is
// drawn frame by frame or looked at. Time starts at 0 and moves only when kvvideo sets it with
// `window.__kvvideoClock.advance(ms)`: each timer due by then runs at its own time, in order, then each frame callback
// once, then every animation of the document, and each video and audio element, is paused at its own time since it
// was first seen. `Math.random` is seeded the same at every load. A callback's error is reported as the browser
// reports one, and the others still run. `advance` answers the sound cues that started.

export type SoundCue = { sound: 'pop' | 'whoosh' | 'click'; atMs: number };

/** The page script of kvvideo's clock. */
export const clockScript = `(() => {
  const RealDate = Date;
  const epoch = RealDate.now();
  const realTimeout = window.setTimeout.bind(window);
  let now = 0;
  let seed = 0x2f6b4c3d;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let mixed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
  class ClockDate extends RealDate {
    constructor(...given) {
      if (given.length === 0) super(epoch + now);
      else super(...given);
    }
    static now() {
      return epoch + now;
    }
  }
  window.Date = ClockDate;
  performance.now = () => now;
  let nextId = 1;
  const timers = new Map();
  const add = (callback, ms, given, period) => {
    const id = nextId++;
    const wait = Math.max(0, Number(ms) || 0);
    timers.set(id, { at: now + wait, callback, given, period: period ? Math.max(1, wait) : 0 });
    return id;
  };
  window.setTimeout = (callback, ms, ...given) => add(callback, ms, given, false);
  window.setInterval = (callback, ms, ...given) => add(callback, ms, given, true);
  window.clearTimeout = (id) => void timers.delete(id);
  window.clearInterval = (id) => void timers.delete(id);
  let frames = new Map();
  window.requestAnimationFrame = (callback) => {
    const id = nextId++;
    frames.set(id, callback);
    return id;
  };
  window.cancelAnimationFrame = (id) => void frames.delete(id);
  const call = (callback, given) => {
    try {
      if (typeof callback === 'function') callback(...given);
    } catch (error) {
      reportError(error);
    }
  };
  const runTimers = (until) => {
    for (let runs = 0; runs < 100000; runs += 1) {
      let due;
      for (const [id, timer] of timers) if (timer.at <= until && (due === undefined || timer.at < due[1].at)) due = [id, timer];
      if (due === undefined) return;
      const [id, timer] = due;
      now = timer.at;
      if (timer.period > 0) timer.at += timer.period;
      else timers.delete(id);
      call(timer.callback, timer.given);
    }
  };
  const born = new WeakMap();
  const bornAt = (thing, at) => {
    if (!born.has(thing)) born.set(thing, at);
    return born.get(thing);
  };
  const seeks = (at) => {
    const waits = [];
    for (const media of document.querySelectorAll('video, audio')) {
      media.pause();
      const target = Math.max(0, at - bornAt(media, at)) / 1000;
      if (Math.abs(media.currentTime - target) < 0.0005) continue;
      waits.push(new Promise((resolve) => {
        media.addEventListener('seeked', resolve, { once: true });
        realTimeout(resolve, 1000);
      }));
      media.currentTime = target;
    }
    return Promise.all(waits);
  };
  const cued = new WeakSet();
  const sounds = new Set(['pop', 'whoosh', 'click']);
  const started = (element) => element.getAnimations().some((animation) => {
    const delay = animation.effect?.getComputedTiming().delay ?? 0;
    return animation.currentTime !== null && Number(animation.currentTime) >= delay;
  });
  const cues = (at) => {
    const found = [];
    for (const element of document.querySelectorAll('[data-sound]')) {
      const sound = element.getAttribute('data-sound');
      if (cued.has(element) || !sounds.has(sound) || !started(element)) continue;
      cued.add(element);
      found.push({ sound, atMs: Math.round(at) });
    }
    return found;
  };
  const advance = async (at) => {
    runTimers(at);
    now = at;
    const due = frames;
    frames = new Map();
    for (const callback of due.values()) call(callback, [at]);
    for (const animation of document.getAnimations()) {
      animation.pause();
      animation.currentTime = at - bornAt(animation, at);
    }
    await seeks(at);
    return cues(at);
  };
  Object.defineProperty(window, '__kvvideoClock', { value: Object.freeze({ advance }) });
})();`;
