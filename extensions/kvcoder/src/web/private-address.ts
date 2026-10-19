import { isIP } from 'node:net';

// The addresses `web fetch` never reaches (plan 08 §8.5, ADR 0095, 3): loopback, private, link-local, unique-local,
// unspecified, and multicast, in IPv4 and IPv6, and IPv4 written inside IPv6.

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

function v4Number(address: string): number {
  return address.split('.').reduce((total, part) => total * 256 + Number(part), 0);
}

function privateV4(address: string): boolean {
  const value = v4Number(address);
  return v4Blocks.some(([base, bits]) => Math.floor(value / 2 ** (32 - bits)) === Math.floor(base / 2 ** (32 - bits)));
}

function privateV6(address: string): boolean {
  const lower = address.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped?.[1] !== undefined) return privateV4(mapped[1]);
  if (lower === '::' || lower === '::1') return true;
  const first = Number.parseInt(lower.split(':')[0] ?? '0', 16);
  // fc00::/7 unique-local, fe80::/10 link-local, ff00::/8 multicast.
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00;
}

/** Whether an address is one `web fetch` must not reach; something that isn't an address counts as one. */
export function isPrivateAddress(address: string): boolean {
  const kind = isIP(address);
  if (kind === 4) return privateV4(address);
  if (kind === 6) return privateV6(address);
  return true;
}
