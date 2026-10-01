import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, createPublicKey, verify } from 'node:crypto';
import { encrypt, vapidAuthorization } from '../webpush.ts';

// RFC 8291 appendix A.
const AS_PRIVATE = 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw';
const UA_PUBLIC = 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4';
const AUTH = 'BTBZMqHH6r4Tts7J_aSIgg';
const SALT = 'DGv6ra1nlYgDCS1FRnbzlw';
const PLAINTEXT = 'V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24';
const AS_PUBLIC = 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8';
const CIPHERTEXT = '8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ';

test('encryption reproduces the RFC 8291 example byte for byte', () => {
  const sender = createECDH('prime256v1'); sender.setPrivateKey(Buffer.from(AS_PRIVATE, 'base64url'));
  const { body, ciphertext } = encrypt(Buffer.from(PLAINTEXT, 'base64url'), UA_PUBLIC, AUTH, { salt: Buffer.from(SALT, 'base64url'), sender });
  assert.equal(ciphertext.toString('base64url'), CIPHERTEXT);
  assert.equal(body.subarray(0, 16).toString('base64url'), SALT);
  assert.equal(body.readUInt32BE(16), 4096);
  assert.equal(body[20], 65);
  assert.equal(body.subarray(21, 86).toString('base64url'), AS_PUBLIC);
});

test('a VAPID token names the push service origin and verifies with the public key', () => {
  const k = createECDH('prime256v1'); k.generateKeys();
  const v = { publicKey: k.getPublicKey().toString('base64url'), privateKey: k.getPrivateKey().toString('base64url'), subject: 'mailto:hello@wanderalt.app' };
  const header = vapidAuthorization('https://push.example/send/abc', v, 1_700_000_000_000);
  const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(header)!;
  assert.ok(m); assert.equal(m[4], v.publicKey);
  const claims = JSON.parse(Buffer.from(m[2], 'base64url').toString());
  assert.deepEqual(claims, { aud: 'https://push.example', exp: 1_700_000_000 + 12 * 3600, sub: 'mailto:hello@wanderalt.app' });
  const pub = createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: k.getPublicKey().subarray(1, 33).toString('base64url'), y: k.getPublicKey().subarray(33).toString('base64url') } });
  assert.equal(verify('sha256', Buffer.from(`${m[1]}.${m[2]}`), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(m[3], 'base64url')), true);
});
