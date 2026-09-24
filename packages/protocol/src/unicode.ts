function isHighSurrogate(unit: number): boolean {
  return unit >= 0xd800 && unit <= 0xdbff;
}

function isLowSurrogate(unit: number): boolean {
  return unit >= 0xdc00 && unit <= 0xdfff;
}

function codePointAt(text: string, index: number): number {
  const unit = text.charCodeAt(index);
  const next = text.charCodeAt(index + 1);
  if (isHighSurrogate(unit) && isLowSurrogate(next)) return (unit - 0xd800) * 0x400 + (next - 0xdc00) + 0x10000;
  return unit;
}

export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    if (unit < 0x80) bytes += 1;
    else if (unit < 0x800) bytes += 2;
    else if (isHighSurrogate(unit) && isLowSurrogate(text.charCodeAt(index + 1))) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
}

export function jsonByteLength(value: unknown): number {
  return utf8ByteLength(JSON.stringify(value));
}

export function compareByCodePoint(left: string, right: string): number {
  const shorter = Math.min(left.length, right.length);
  for (let index = 0; index < shorter; index += 1) {
    if (left.charCodeAt(index) !== right.charCodeAt(index)) return codePointAt(left, index) - codePointAt(right, index);
  }
  return left.length - right.length;
}
