import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { canonicalJson, jsonSchema, presetImportTokenClaimsSchema, type Json, type Preset } from '@kvman/protocol';

export const presetTokenLifetimeMs = 10 * 60_000;

// 03 §3.8, ADR 0147: import preview tokens are stateless, an HMAC with a per-boot key over the previewed preset
// and a 10-minute expiry, so the import adds exactly what the preview showed.
export class PresetImportTokens {
  readonly #key: Buffer;
  readonly #now: () => number;

  constructor(now: () => number, key: Buffer = randomBytes(32)) {
    this.#now = now;
    this.#key = key;
  }

  issue(preset: Preset): string {
    const claims: Json = jsonSchema.parse({ preset, expiresAt: this.#now() + presetTokenLifetimeMs });
    const body = Buffer.from(canonicalJson(claims), 'utf8').toString('base64url');
    return `${body}.${this.#sign(body)}`;
  }

  // The preset of a token this kernel issued and that has not expired; a matching signature means this kernel
  // wrote the body.
  verify(token: string): Preset | undefined {
    const [body, signature, ...rest] = token.split('.');
    if (body === undefined || signature === undefined || rest.length > 0) return undefined;
    const expected = Buffer.from(this.#sign(body), 'utf8');
    const given = Buffer.from(signature, 'utf8');
    if (expected.byteLength !== given.byteLength || !timingSafeEqual(expected, given)) return undefined;
    let claims: unknown;
    try {
      claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch (error) {
      if (error instanceof SyntaxError) return undefined;
      throw error;
    }
    const parsed = presetImportTokenClaimsSchema.safeParse(claims);
    if (!parsed.success || this.#now() > parsed.data.expiresAt) return undefined;
    return parsed.data.preset;
  }

  #sign(body: string): string {
    return createHmac('sha256', this.#key).update(body).digest('base64url');
  }
}
