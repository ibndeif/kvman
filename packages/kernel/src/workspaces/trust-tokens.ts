import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { canonicalJson, trustLimits, trustTokenClaimsSchema, type TrustedFile, type TrustTokenClaims } from '@kvman/protocol';

// The digest a token covers: the exact files and hashes of a preview.
export function filesDigest(files: readonly TrustedFile[]): string {
  return createHash('sha256').update(canonicalJson(files.map(({ path, sha256 }) => ({ path, sha256 })))).digest('hex');
}

// 03 §3.8, ADR 0137: preview tokens are stateless, an HMAC with a per-boot key over the workspace, the previewed
// files' digest, and a 10-minute expiry, so a preview stays a read-only query. A token from an earlier boot, an
// expired one, or one changed in any way is refused.
export class TrustTokens {
  readonly #key: Buffer;
  readonly #now: () => number;

  constructor(now: () => number, key: Buffer = randomBytes(32)) {
    this.#now = now;
    this.#key = key;
  }

  issue(workspaceId: string, files: readonly TrustedFile[]): string {
    const claims: TrustTokenClaims = { workspaceId, digest: filesDigest(files), expiresAt: this.#now() + trustLimits.tokenMs };
    const body = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
    return `${body}.${this.#sign(body)}`;
  }

  // The claims of a token this kernel issued and that has not expired; a matching signature means this kernel wrote
  // the body.
  verify(token: string): TrustTokenClaims | undefined {
    const [body, signature, ...rest] = token.split('.');
    if (body === undefined || signature === undefined || rest.length > 0) return undefined;
    const expected = Buffer.from(this.#sign(body), 'utf8');
    const given = Buffer.from(signature, 'utf8');
    if (expected.byteLength !== given.byteLength || !timingSafeEqual(expected, given)) return undefined;
    const claims = trustTokenClaimsSchema.safeParse(JSON.parse(Buffer.from(body, 'base64url').toString('utf8')));
    if (!claims.success || this.#now() > claims.data.expiresAt) return undefined;
    return claims.data;
  }

  #sign(body: string): string {
    return createHmac('sha256', this.#key).update(body).digest('base64url');
  }
}
