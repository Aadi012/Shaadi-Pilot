import 'server-only';
import { z } from 'zod';
import {
  ConfigurationError,
  readAppEnvironment,
} from '@/lib/config/env.server';
export function emailEnvironment(
  source: Record<string, string | undefined> = process.env,
) {
  const apiKey = source.RESEND_API_KEY?.trim();
  const from = source.RESEND_FROM_EMAIL?.trim() || source.EMAIL_FROM?.trim();
  const keyId = source.TOKEN_ENCRYPTION_KEY_ID?.trim();
  const encoded = source.TOKEN_ENCRYPTION_KEY?.trim();
  const key =
    encoded && /^[a-f0-9]{64}$/i.test(encoded)
      ? Buffer.from(encoded, 'hex')
      : Buffer.from(encoded ?? '', 'base64');
  const address = from?.includes('<')
    ? from.match(/^[^<>\r\n]+ <([^<>\s]+@[^<>\s]+)>$/)?.[1]
    : from;
  const missing: string[] = [];
  if (!apiKey || !/^re_[A-Za-z0-9_-]+$/.test(apiKey))
    missing.push('RESEND_API_KEY');
  if (!from || /[\r\n]/.test(from) || !z.email().safeParse(address).success)
    missing.push('RESEND_FROM_EMAIL');
  if (!keyId || !/^[A-Za-z0-9_-]{1,40}$/.test(keyId))
    missing.push('TOKEN_ENCRYPTION_KEY_ID');
  if (
    !encoded ||
    key.length !== 32 ||
    !(/^[a-f0-9]{64}$/i.test(encoded) || /^[A-Za-z0-9+/]{43}=$/.test(encoded))
  )
    missing.push('TOKEN_ENCRYPTION_KEY');
  if (missing.length) throw new ConfigurationError(missing);
  return {
    apiKey: apiKey!,
    from: from!,
    keyId: keyId!,
    key,
    baseUrl: readAppEnvironment(source).APP_BASE_URL,
  };
}
