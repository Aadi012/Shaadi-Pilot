import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { ConfigurationError } from '@/lib/config/env.server';
function config() {
  const encoded = process.env.TOKEN_ENCRYPTION_KEY ?? '';
  const key = /^[a-f0-9]{64}$/i.test(encoded)
    ? Buffer.from(encoded, 'hex')
    : Buffer.from(encoded, 'base64');
  const keyId = process.env.TOKEN_ENCRYPTION_KEY_ID ?? '';
  if (key.length !== 32 || !/^[A-Za-z0-9_-]{1,40}$/.test(keyId))
    throw new ConfigurationError([
      'TOKEN_ENCRYPTION_KEY',
      'TOKEN_ENCRYPTION_KEY_ID',
    ]);
  return { key, keyId };
}
export function encryptCapability(secret: string, id: string) {
  const { key, keyId } = config(),
    iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(`shaadipilot:guest-invitation:v1:${id}:${keyId}`));
  const ciphertext = Buffer.concat([
    cipher.update(secret, 'utf8'),
    cipher.final(),
  ]);
  return {
    keyId,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}
export function decryptCapability(
  encrypted: ReturnType<typeof encryptCapability>,
  id: string,
) {
  const { key, keyId } = config();
  if (encrypted.keyId !== keyId)
    throw new ConfigurationError(['TOKEN_ENCRYPTION_KEY_ID']);
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(encrypted.iv, 'base64'),
  );
  decipher.setAAD(
    Buffer.from(`shaadipilot:guest-invitation:v1:${id}:${keyId}`),
  );
  decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
