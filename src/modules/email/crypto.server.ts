import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { emailEnvironment } from './config.server';
export function encryptEmail(plaintext: string, id: string) {
  const { key, keyId } = emailEnvironment();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(`shaadipilot:email:v1:${id}:${keyId}`));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  return {
    keyId,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}
export function decryptEmail(
  encrypted: ReturnType<typeof encryptEmail>,
  id: string,
) {
  const { key, keyId } = emailEnvironment();
  if (encrypted.keyId !== keyId) throw new Error('Email key unavailable');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(encrypted.iv, 'base64'),
  );
  decipher.setAAD(Buffer.from(`shaadipilot:email:v1:${id}:${keyId}`));
  decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
