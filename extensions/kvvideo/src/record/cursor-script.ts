// What a recorded page draws (plan 16 §16.5; ADR 0115, 9 and 53): a browser's recording has no pointer, so on a
// desktop the page draws an arrow that follows the mouse, hidden until the mouse first moves; a press shrinks it for
// 120 ms and shows a ring. On a phone it draws a round mark at each touch instead. Scroll bars are hidden. The script
// is added to every page before its own scripts run.

const arrowPath = 'M3 2 L3 20 L7.6 15.6 L10.6 22.6 L13.8 21.2 L10.9 14.4 L17.2 14.4 Z';

const shared = `
  const hideScrollBars = () => {
    const style = document.createElement('style');
    style.textContent = 'html { scrollbar-width: none; } ::-webkit-scrollbar { display: none; }';
    document.documentElement.appendChild(style);
  };
  const ring = (x, y, size, color) => {
    const mark = document.createElement('div');
    mark.className = 'kvvideo-ring';
    mark.style.cssText = 'position:fixed;direction:ltr;inset-inline-start:' + (x - size / 2) + 'px;inset-block-start:' + (y - size / 2) + 'px;inline-size:' + size + 'px;block-size:' + size + 'px;border-radius:50%;box-sizing:border-box;border:3px solid ' + color + ';pointer-events:none;z-index:2147483646';
    document.documentElement.appendChild(mark);
    mark.animate([{ opacity: 1, transform: 'scale(.4)' }, { opacity: 0, transform: 'scale(1.3)' }], { duration: 500 }).onfinish = () => mark.remove();
  };`;

const desktop = `
  const draw = () => {
    if (document.getElementById('kvvideo-cursor')) return;
    hideScrollBars();
    const pointer = document.createElement('div');
    pointer.id = 'kvvideo-cursor';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [name, value] of [['width', '26'], ['height', '26'], ['viewBox', '0 0 26 26']]) svg.setAttribute(name, value);
    const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    for (const [name, value] of [['d', ${JSON.stringify(arrowPath)}], ['fill', '#fff'], ['stroke', '#111'], ['stroke-width', '1.6'], ['stroke-linejoin', 'round']]) shape.setAttribute(name, value);
    svg.appendChild(shape);
    pointer.appendChild(svg);
    pointer.style.cssText = 'position:fixed;direction:ltr;inset-inline-start:0;inset-block-start:0;inline-size:26px;block-size:26px;margin-block-start:-2px;margin-inline-start:-3px;display:none;transform-origin:3px 2px;pointer-events:none;z-index:2147483647;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))';
    document.documentElement.appendChild(pointer);
    let x = 0; let y = 0; let scale = 1;
    const place = () => { pointer.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + scale + ')'; };
    window.addEventListener('mousemove', (event) => { x = event.clientX; y = event.clientY; pointer.style.display = 'block'; place(); }, true);
    window.addEventListener('mousedown', (event) => {
      scale = 0.85; place();
      setTimeout(() => { scale = 1; place(); }, 120);
      ring(event.clientX, event.clientY, 44, 'rgba(255,190,0,.9)');
    }, true);
  };`;

const phone = `
  const draw = () => {
    if (document.getElementById('kvvideo-touch')) return;
    hideScrollBars();
    const marker = document.createElement('meta');
    marker.id = 'kvvideo-touch';
    document.documentElement.appendChild(marker);
    window.addEventListener('touchstart', (event) => {
      for (const touch of event.changedTouches) ring(touch.clientX, touch.clientY, 40, 'rgba(255,255,255,.9)');
    }, true);
  };`;

/** The script a page of the device gets. */
export function cursorScript(device: 'desktop' | 'phone'): string {
  return `(() => {${shared}${device === 'phone' ? phone : desktop}
  if (document.documentElement) draw(); else document.addEventListener('DOMContentLoaded', draw);
})();`;
}
