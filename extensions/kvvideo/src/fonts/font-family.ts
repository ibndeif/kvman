import { invalid } from '../problems.ts';

// A TrueType or OpenType font's family, from its `name` table (plan 16 §16.7): the Windows English name 1 when there
// is one, else the first Windows name 1, else the Macintosh Roman one. A collection or a file that isn't a font fails
// `VALIDATION_FAILED`.

type NameRecord = { platform: number; encoding: number; language: number; nameId: number; length: number; offset: number };

function nameTableOffset(font: Buffer): number | undefined {
  if (font.length < 12) return undefined;
  const version = font.readUInt32BE(0);
  if (version !== 0x00010000 && version !== 0x4f54544f && version !== 0x74727565) return undefined;
  const tables = font.readUInt16BE(4);
  for (let index = 0; index < tables; index += 1) {
    const at = 12 + index * 16;
    if (at + 16 > font.length) return undefined;
    if (font.toString('latin1', at, at + 4) === 'name') return font.readUInt32BE(at + 8);
  }
  return undefined;
}

function recordsOf(font: Buffer, table: number): { records: NameRecord[]; strings: number } {
  const count = font.readUInt16BE(table + 2);
  const strings = table + font.readUInt16BE(table + 4);
  const records = Array.from({ length: count }, (_, index) => {
    const at = table + 6 + index * 12;
    return { platform: font.readUInt16BE(at), encoding: font.readUInt16BE(at + 2), language: font.readUInt16BE(at + 4), nameId: font.readUInt16BE(at + 6), length: font.readUInt16BE(at + 8), offset: font.readUInt16BE(at + 10) };
  });
  return { records, strings };
}

function decode(font: Buffer, strings: number, record: NameRecord): string {
  const bytes = font.subarray(strings + record.offset, strings + record.offset + record.length);
  return record.platform === 3 ? Buffer.from(bytes).swap16().toString('utf16le') : bytes.toString('latin1');
}

export function fontFamily(font: Buffer, file: string): string {
  const table = nameTableOffset(font);
  if (table === undefined || table + 6 > font.length) throw invalid(`${file} isn't a TrueType or OpenType font.`, { path: file });
  const { records, strings } = recordsOf(font, table);
  const families = records.filter((record) => record.nameId === 1);
  const windows = families.filter((record) => record.platform === 3 && (record.encoding === 1 || record.encoding === 10));
  const chosen = windows.find((record) => record.language === 0x409) ?? windows[0] ?? families.find((record) => record.platform === 1 && record.encoding === 0);
  if (chosen === undefined || strings + chosen.offset + chosen.length > font.length) throw invalid(`${file} has no family name.`, { path: file });
  return decode(font, strings, chosen);
}
