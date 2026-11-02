import path from 'node:path';
import type { Brand } from '../brand/brand.ts';
import { captionFont } from './caption-font.ts';
import { calloutHtml, chromeHtml, highlightHtml, maskHtml, type Painter } from './drawn-images.ts';
import type { ScenePicture } from './compose-plan.ts';
import type { SceneDrawn } from './scene-args.ts';

// The images a scene's frame and overlays need (plan 16 §16.8; ADR 0115, 36 and 60), drawn by the browser into the
// work folder: a window's or a phone's chrome and the clip's mask at the picture's size, and each callout and
// highlight at the recording's own size. A blur needs no image.

export const defaultAccent = '#FFD54A';

/** Whether a scene needs the browser to draw anything. */
export function needsDrawing(picture: ScenePicture): boolean {
  return picture.layout !== undefined || picture.look.overlays.some((overlay) => overlay.kind !== 'blur');
}

export type DrawingContext = { root: string; folder: string; picture: { width: number; height: number }; brand: Brand | null; painter: Painter };

export async function drawScene(context: DrawingContext, number: number, picture: ScenePicture): Promise<SceneDrawn> {
  const name = (part: string): string => `scene-${String(number)}-${part}.png`;
  const at = (file: string): string => path.join(context.folder, file);
  const { layout, source } = picture;
  let chrome: string | undefined;
  let mask: string | undefined;
  if (layout !== undefined) {
    chrome = name('chrome');
    mask = name('mask');
    await context.painter.draw(at(chrome), context.picture, chromeHtml(layout), true);
    await context.painter.draw(at(mask), { width: layout.screen.width, height: layout.screen.height }, maskHtml({ width: layout.screen.width, height: layout.screen.height }, layout.radius), false);
  }
  const overlayImages: (string | undefined)[] = [];
  for (const [index, overlay] of picture.look.overlays.entries()) {
    if (overlay.kind === 'blur' || source === undefined) {
      overlayImages.push(undefined);
      continue;
    }
    const file = name(`overlay-${String(index + 1)}`);
    const colour = context.brand?.colors.primary ?? defaultAccent;
    const html = overlay.kind === 'highlight' ? highlightHtml(overlay.box, picture.look.scale) : calloutHtml(source, overlay.box, overlay.text ?? '', colour, captionFont(context.root, context.brand?.font ?? undefined, [overlay.text ?? '']));
    await context.painter.draw(at(file), source, html, true);
    overlayImages.push(file);
  }
  return { layout, chrome, mask, overlayImages };
}
