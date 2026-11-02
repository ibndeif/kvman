// Where a clip sits in the picture (plan 16 §16.8; ADR 0115, 10): in a window inside margins of 6% of the picture's
// shorter side, 14% at the bottom when captions are at the bottom, so they sit on the background; in a phone 88% of
// the picture's height; or, with no frame, as large as fits. Sizes are even, as H.264 needs.

export type Size = { width: number; height: number };

export type Rect = { x: number; y: number; width: number; height: number };

export type WindowLayout = { kind: 'window'; screen: Rect; radius: number; shadow: { offset: number; blur: number } };

export type PhoneLayout = { kind: 'phone'; body: Rect; bodyRadius: number; screen: Rect; radius: number };

export type Layout = WindowLayout | PhoneLayout;

const even = (value: number): number => Math.max(2, 2 * Math.round(value / 2));

function fitted(clip: Size, room: Rect): Rect {
  const scale = Math.min(room.width / clip.width, room.height / clip.height);
  const width = even(clip.width * scale);
  const height = even(clip.height * scale);
  return { x: Math.round(room.x + (room.width - width) / 2), y: Math.round(room.y + (room.height - height) / 2), width, height };
}

export function windowLayout(picture: Size, clip: Size, captionsAtBottom: boolean): WindowLayout {
  const shorter = Math.min(picture.width, picture.height);
  const margin = 0.06 * shorter;
  const bottom = captionsAtBottom ? 0.14 * shorter : margin;
  const room = { x: margin, y: margin, width: picture.width - 2 * margin, height: picture.height - margin - bottom };
  return { kind: 'window', screen: fitted(clip, room), radius: Math.round(0.015 * shorter), shadow: { offset: Math.round(0.02 * shorter), blur: Math.round(0.05 * shorter) } };
}

export function phoneLayout(picture: Size, clip: Size): PhoneLayout {
  let bodyHeight = 0.88 * picture.height;
  let bezel = 0.022 * bodyHeight;
  let screenHeight = bodyHeight - 2 * bezel;
  let bodyWidth = (screenHeight * clip.width) / clip.height + 2 * bezel;
  const widest = 0.88 * picture.width;
  if (bodyWidth > widest) {
    const shrink = widest / bodyWidth;
    [bodyHeight, bezel, screenHeight, bodyWidth] = [bodyHeight * shrink, bezel * shrink, screenHeight * shrink, widest];
  }
  const body = { x: Math.round((picture.width - bodyWidth) / 2), y: Math.round((picture.height - bodyHeight) / 2), width: even(bodyWidth), height: even(bodyHeight) };
  const screen = { x: Math.round(body.x + bezel), y: Math.round(body.y + bezel), width: even(bodyWidth - 2 * bezel), height: even(screenHeight) };
  const bodyRadius = Math.round(0.12 * bodyWidth);
  return { kind: 'phone', body, bodyRadius, screen, radius: Math.max(0, Math.round(bodyRadius - bezel)) };
}
