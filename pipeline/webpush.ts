// Web Push without a dependency: RFC 8291 message encryption (aes128gcm) and
// RFC 8292 VAPID, on node:crypto. The one test vector in RFC 8291 appendix A
// is in test/webpush.test.ts, so the byte layout is checked, not trusted.

import { createCipheriv, createECDH, createPrivateKey, hkdfSync, randomBytes, sign, type ECDH } from 'node:crypto';

export interface PushSubscription { endpoint: string; p256dh: string; auth: string }
export interface Vapid { publicKey: string; privateKey: string; subject: string }

const b64u = (b: Uint8Array) => Buffer.from(b).toString('base64url');
const fromB64u = (s: string) => Buffer.from(s, 'base64url');
const hkdf = (ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, len: number) =>
  Buffer.from(hkdfSync('sha256', ikm, salt, info, len));

/** One aes128gcm record: salt, record size, sender key, then the sealed payload. */
export function encrypt(payload: Uint8Array, uaPublic: string, authSecret: string,
  opts: { salt?: Buffer; sender?: ECDH } = {}): { body: Buffer; ciphertext: Buffer } {
  const ua = fromB64u(uaPublic), auth = fromB64u(authSecret);
  if (ua.length !== 65 || ua[0] !== 4 || auth.length !== 16) throw new Error('bad subscription keys');
  if (payload.length > 3993) throw new Error('payload too large for one record');
  const sender = opts.sender ?? createECDH('prime256v1');
  if (!opts.sender) sender.generateKeys();
  const asPublic = sender.getPublicKey();
  const salt = opts.salt ?? randomBytes(16);
  const ikm = hkdf(sender.computeSecret(ua), auth,
    Buffer.concat([Buffer.from('WebPush: info\0'), ua, asPublic]), 32);
  const cek = hkdf(ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12);
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0); header.writeUInt32BE(4096, 16); header[20] = asPublic.length;
  return { body: Buffer.concat([header, asPublic, ciphertext]), ciphertext };
}

/** The Authorization header value for a push service: a signed ES256 token for the endpoint's origin. */
export function vapidAuthorization(endpoint: string, v: Vapid, now = Date.now()): string {
  const pub = fromB64u(v.publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('bad VAPID public key');
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: v.subject })}`;
  const key = createPrivateKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', d: v.privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) } });
  const sig = sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${unsigned}.${b64u(sig)}, k=${v.publicKey}`;
}

/** Sends one push. Resolves 'gone' when the subscription no longer exists (404, 410) so it can be deleted. */
export async function sendPush(sub: PushSubscription, message: unknown, v: Vapid, ttl = 86_400): Promise<'ok' | 'gone' | 'failed'> {
  const url = new URL(sub.endpoint);
  if (url.protocol !== 'https:') return 'failed';
  const { body } = encrypt(Buffer.from(JSON.stringify(message)), sub.p256dh, sub.auth);
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream', ttl: String(ttl), urgency: 'normal', authorization: vapidAuthorization(sub.endpoint, v) },
    body: new Uint8Array(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (r.status === 404 || r.status === 410) return 'gone';
  return r.ok ? 'ok' : 'failed';
}
