import { randomFillSync } from 'node:crypto';
import type { Clock } from './clock.ts';

// UUIDv7 ids (ADR 0001, 43). Within one millisecond, a 12-bit counter in `rand_a` keeps ids in the order they were
// made (RFC 9562 §6.2, method 1); when it runs out, the id borrows the next millisecond.

export type RandomSource = (bytes: Uint8Array) => void;

export const cryptoRandom: RandomSource = (bytes) => {
  randomFillSync(bytes);
};

export type IdGenerator = () => string;

const counterMaximum = 0xfff;

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

function format(bytes: Uint8Array): string {
  const text = hex(bytes);
  return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`;
}

export function createIdGenerator(clock: Clock, random: RandomSource = cryptoRandom): IdGenerator {
  let lastTime = -1;
  let counter = 0;
  return () => {
    const now = clock.now();
    if (now > lastTime) {
      lastTime = now;
      const seed = new Uint8Array(2);
      random(seed);
      counter = ((seed[0] ?? 0) << 4 | (seed[1] ?? 0) >> 4) & 0x7ff;
    } else if (counter < counterMaximum) {
      counter += 1;
    } else {
      lastTime += 1;
      counter = 0;
    }
    const bytes = new Uint8Array(16);
    random(bytes.subarray(8));
    const time = BigInt(lastTime);
    for (let index = 0; index < 6; index += 1) bytes[index] = Number((time >> BigInt(8 * (5 - index))) & 0xffn);
    bytes[6] = 0x70 | (counter >> 8);
    bytes[7] = counter & 0xff;
    bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f);
    return format(bytes);
  };
}
