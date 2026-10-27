// The cursor a recording shows (ADR 0107, 19): a browser's recording has no pointer, so the page draws a dot that
// follows the mouse and a ring at each press. It is added to every page before its own scripts run.

export const cursorScript = `(() => {
  const draw = () => {
    if (document.getElementById('kvvideo-cursor')) return;
    const dot = document.createElement('div');
    dot.id = 'kvvideo-cursor';
    dot.style.cssText = 'position:fixed;inset-inline-start:0;inset-block-start:0;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(20,20,20,.75);border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,.5);pointer-events:none;z-index:2147483647;transform:translate(-100px,-100px)';
    document.documentElement.appendChild(dot);
    window.addEventListener('mousemove', (event) => { dot.style.transform = 'translate(' + event.clientX + 'px,' + event.clientY + 'px)'; }, true);
    window.addEventListener('mousedown', (event) => {
      const ring = document.createElement('div');
      ring.className = 'kvvideo-ring';
      ring.style.cssText = 'position:fixed;inset-inline-start:' + (event.clientX - 22) + 'px;inset-block-start:' + (event.clientY - 22) + 'px;width:44px;height:44px;border-radius:50%;border:3px solid rgba(255,190,0,.9);pointer-events:none;z-index:2147483646';
      document.documentElement.appendChild(ring);
      ring.animate([{ opacity: 1, transform: 'scale(.4)' }, { opacity: 0, transform: 'scale(1.3)' }], { duration: 500 }).onfinish = () => ring.remove();
    }, true);
  };
  if (document.documentElement) draw(); else document.addEventListener('DOMContentLoaded', draw);
})();`;
