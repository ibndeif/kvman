// The clipboard's images as files (ADR 0073, 3). WebKitGTK, the engine of the desktop app's window on Linux, gives the
// paste of a copied image no files, and lets the page read the clipboard while that paste is handled.

const kinds = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;

/** Each clipboard item's image, in the first kind of PNG, JPEG, GIF, and WebP that it offers. */
export async function clipboardImages(): Promise<File[]> {
  const found: File[] = [];
  for (const item of await navigator.clipboard.read()) {
    const kind = kinds.find((candidate) => item.types.includes(candidate));
    if (kind !== undefined) found.push(new File([await item.getType(kind)], `image.${kind.slice('image/'.length)}`, { type: kind }));
  }
  return found;
}
