import { isIP } from 'node:net';

// The addresses `web fetch` never reaches (plan 08 §8.5, ADR 0095, 3): loopback, private, link-local, unique-local,
// unspecified, and multicast, in IPv4 and IPv6, and IPv4 carried inside IPv6. Addresses are compared as numbers, so
// every spelling of one address (`::ffff:127.0.0.1`, `::ffff:7f00:1`) is judged the same.

const v4Blocks: readonly [number, number][] = [
  [0x00000000, 8], // 0.0.0.0/8, unspecified
  [0x0a000000, 8], // 10/8
  [0x64400000, 10], // 100.64/10, shared
  [0x7f000000, 8], // 127/8, loopback
  [0xa9fe0000, 16], // 169.254/16, link-local
  [0xac100000, 12], // 172.16/12
  [0xc0a80000, 16], // 192.168/16
  [0xe0000000, 4], // 224/4, multicast
  [0xf0000000, 4], // 240/4, reserved
];

function privateV4(value: number): boolean {
  return v4Blocks.some(([base, bits]) => Math.floor(value / 2 ** (32 - bits)) === Math.floor(base / 2 ** (32 - bits)));
}

function v4Number(address: string): number {
  return address.split('.').reduce((total, part) => total * 256 + Number(part), 0);
}

/** The eight 16-bit groups of an IPv6 address, or nothing when it doesn't expand to exactly eight. */
function hextets(address: string): number[] | undefined {
  const dotted = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(address);
  const v4 = dotted?.[2] === undefined ? undefined : v4Number(dotted[2]);
  const text = dotted?.[1] === undefined || v4 === undefined ? address : `${dotted[1]}${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  const halves = text.split('::');
  if (halves.length > 2) return undefined;
  const groups = (half: string | undefined) => (half === undefined || half === '' ? [] : half.split(':').map((group) => (/^[\da-f]{1,4}$/i.test(group) ? Number.parseInt(group, 16) : Number.NaN)));
  const head = groups(halves[0]), tail = groups(halves[1]);
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return undefined;
  const all = [...head, ...Array<number>(halves.length === 1 ? 0 : missing).fill(0), ...tail];
  return all.some(Number.isNaN) ? undefined : all;
}

const v4Of = (high: number, low: number) => high * 0x10000 + low;
const zeros = (groups: readonly number[]) => groups.every((group) => group === 0);

function privateV6(address: string): boolean {
  const groups = hextets(address);
  if (groups === undefined) return true;
  const [first = 0, second = 0, third = 0, , , sixth = 0, seventh = 0, eighth = 0] = groups;
  // ::/96 holds :: and ::1 and the old IPv4-compatible form; ::ffff:0:0/96 is IPv4 mapped into IPv6.
  if (zeros(groups.slice(0, 6))) return true;
  if (zeros(groups.slice(0, 5)) && sixth === 0xffff) return privateV4(v4Of(seventh, eighth));
  // 64:ff9b::/96 is NAT64 and 2002::/16 is 6to4: each carries an IPv4 address, judged as one.
  if (first === 0x64 && second === 0xff9b && zeros(groups.slice(2, 6))) return privateV4(v4Of(seventh, eighth));
  if (first === 0x64 && second === 0xff9b && third === 1) return true; // 64:ff9b:1::/48, NAT64 for local use
  if (first === 0x2002) return privateV4(v4Of(second, third));
  // fc00::/7 unique-local, fe80::/10 link-local, fec0::/10 site-local, ff00::/8 multicast.
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xffc0) === 0xfec0 || (first & 0xff00) === 0xff00;
}

/** Whether an address is one `web fetch` must not reach; something that isn't an address counts as one. */
export function isPrivateAddress(address: string): boolean {
  const kind = isIP(address);
  if (kind === 4) return privateV4(v4Number(address));
  if (kind === 6) return privateV6(address.split('%')[0] ?? address);
  return true;
}
