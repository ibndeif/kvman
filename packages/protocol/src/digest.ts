import { canonicalJson } from './canonical-json.ts';
import type { Json, JsonObject } from './json.ts';

type WebPlatform = {
  crypto: { subtle: { digest(algorithm: 'SHA-256', data: Uint8Array): Promise<ArrayBuffer> } };
  TextEncoder: new () => { encode(text: string): Uint8Array };
};

const webPlatform = globalThis as unknown as WebPlatform;

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new webPlatform.TextEncoder().encode(text);
  const digest = new Uint8Array(await webPlatform.crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function digestOf(value: Json): Promise<string> {
  return sha256Hex(canonicalJson(value));
}

export type RequestDigestInput = { type: string; workspaceId?: string; lane?: string; payload: Json };

// What an idempotency digest covers (02 §2.7); the kernel hashes the same canonical JSON synchronously.
export function requestDigestFields(input: RequestDigestInput): JsonObject {
  const fields: JsonObject = { type: input.type, payload: input.payload };
  if (input.workspaceId !== undefined) fields['workspaceId'] = input.workspaceId;
  if (input.lane !== undefined) fields['lane'] = input.lane;
  return fields;
}

export function requestDigest(input: RequestDigestInput): Promise<string> {
  return digestOf(requestDigestFields(input));
}
