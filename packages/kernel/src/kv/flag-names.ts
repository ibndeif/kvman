// 12 §12.6, ADR 0141: a top-level input field `fileId` is the flag `--file-id`.
export function flagOf(field: string): string {
  return field.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}
