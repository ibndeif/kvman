// 13 §13.7, ADR 0138: a blob is shown inline only when its stored mime is on the allowlist of inert types and its
// bytes match that type; everything else is an attachment.

function startsWith(bytes: Uint8Array, prefix: readonly number[], at = 0): boolean {
  return prefix.every((byte, index) => bytes[at + index] === byte);
}

const ascii = (text: string): number[] => [...text].map((character) => character.charCodeAt(0));

const imageSignatures: Record<string, (head: Uint8Array) => boolean> = {
  'image/png': (head) => startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/jpeg': (head) => startsWith(head, [0xff, 0xd8, 0xff]),
  'image/gif': (head) => startsWith(head, ascii('GIF87a')) || startsWith(head, ascii('GIF89a')),
  'image/webp': (head) => startsWith(head, ascii('RIFF')) && startsWith(head, ascii('WEBP'), 8),
};

// The bytes an image check needs from the start of a blob.
export const sniffBytes = 12;

export type Serving = { inline: true; contentType: string } | { inline: false };

export const attachment: Serving = { inline: false };

export function isInlineCandidate(mime: string): boolean {
  return mime === 'text/plain' || mime in imageSignatures;
}

// An image type is decided by the first bytes.
export function imageServing(mime: string, head: Uint8Array): Serving {
  const matches = imageSignatures[mime];
  return matches !== undefined && matches(head) ? { inline: true, contentType: mime } : attachment;
}

// text/plain is inline when every byte is valid UTF-8 and none is NUL.
export async function textServing(chunks: AsyncIterable<Uint8Array>): Promise<Serving> {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    for await (const chunk of chunks) {
      if (chunk.includes(0)) return attachment;
      decoder.decode(chunk, { stream: true });
    }
    decoder.decode();
  } catch (error) {
    if (error instanceof TypeError) return attachment;
    throw error;
  }
  return { inline: true, contentType: 'text/plain; charset=utf-8' };
}
