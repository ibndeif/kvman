import { randomBytes } from 'node:crypto';

const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const timeLength = 10;
const randomLength = 16;

function encodeTime(time: number): string {
  let rest = time;
  let text = '';
  for (let index = 0; index < timeLength; index += 1) {
    text = `${alphabet.charAt(rest % 32)}${text}`;
    rest = Math.floor(rest / 32);
  }
  return text;
}

function encodeRandom(value: bigint): string {
  let rest = value;
  let text = '';
  for (let index = 0; index < randomLength; index += 1) {
    text = `${alphabet.charAt(Number(rest % 32n))}${text}`;
    rest /= 32n;
  }
  return text;
}

export type UlidGenerator = { next(): string };

export function createUlidGenerator(now: () => number, random: (bytes: number) => Uint8Array = randomBytes): UlidGenerator {
  let lastTime = -1;
  let lastRandom = 0n;
  return {
    next() {
      const time = now();
      if (time === lastTime) {
        lastRandom += 1n;
      } else {
        lastTime = time;
        lastRandom = BigInt(`0x${Buffer.from(random(10)).toString('hex')}`);
      }
      return `${encodeTime(time)}${encodeRandom(lastRandom)}`;
    },
  };
}
