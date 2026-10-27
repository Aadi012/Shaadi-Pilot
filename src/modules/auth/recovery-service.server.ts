import 'server-only';
import { ApiError } from '@/lib/api/errors';
import {
  resetRequestSchema,
  resetInspectSchema,
  resetConfirmSchema,
} from './contracts';
import { consumeLimit } from './repository.server';
import { hashSecret, newSecret, hashPassword } from './security.server';
import {
  findActiveRecoveryUser,
  findReset,
  invalidateRecovery,
  insertReset,
  lockRecoveryUser,
  recoveryDatabase,
  resetUser,
} from './recovery-repository.server';
import { emailEnvironment } from '@/modules/email/config.server';
import {
  queueResetEmail,
  prepareEmailQueue,
} from '@/modules/email/service.server';
const invalid = () =>
  new ApiError({
    status: 400,
    code: 'INVALID_RESET_LINK',
    message: 'This reset link is invalid or has expired. Request a new one.',
  });
export async function requestPasswordReset(input: unknown, address: string) {
  await consumeLimit(`reset-request:ip:${address}`, 20);
  const data = resetRequestSchema.parse(input);
  await consumeLimit(`reset-request:account:${data.email}`, 3);
  try {
    emailEnvironment();
  } catch {
    throw new ApiError({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Password recovery is temporarily unavailable.',
    });
  }
  const db = await recoveryDatabase();
  await prepareEmailQueue();
  const token = newSecret();
  const tokenHash = hashSecret(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60000);
  return db.connection.transaction(async (session) => {
    const user = await lockRecoveryUser(data.email, session);
    if (!user) return null;
    await insertReset(
      {
        userId: user._id,
        tokenHash,
        credentialVersion: user.credentialVersion ?? 0,
        createdAt: now,
        expiresAt,
        usedAt: null,
      },
      session,
    );
    return queueResetEmail(
      user._id,
      user.emailNormalized,
      token,
      expiresAt,
      session,
    );
  });
}
export async function inspectPasswordReset(input: unknown, address: string) {
  await consumeLimit(`reset-inspect:ip:${address}`, 60);
  const { token } = resetInspectSchema.parse(input);
  await consumeLimit(`reset-inspect:token:${hashSecret(token)}`, 20);
  await recoveryDatabase();
  const reset = await findReset(hashSecret(token), new Date());
  return (
    !!reset &&
    !!(await findActiveRecoveryUser(reset.userId, reset.credentialVersion))
  );
}
export async function confirmPasswordReset(input: unknown, address: string) {
  await consumeLimit(`reset-confirm:ip:${address}`, 20);
  const data = resetConfirmSchema.parse(input);
  const tokenHash = hashSecret(data.token);
  await consumeLimit(`reset-confirm:token:${tokenHash}`, 5);
  const db = await recoveryDatabase();
  const initial = await findReset(tokenHash, new Date());
  if (
    !initial ||
    !(await findActiveRecoveryUser(initial.userId, initial.credentialVersion))
  )
    throw invalid();
  const passwordHash = await hashPassword(data.password);
  await db.connection.transaction(async (session) => {
    const now = new Date();
    const reset = await findReset(tokenHash, now, session);
    if (!reset) throw invalid();
    const changed = await resetUser(
      reset.userId,
      reset.credentialVersion,
      passwordHash,
      session,
    );
    if (changed.modifiedCount !== 1) throw invalid();
    await invalidateRecovery(reset.userId, now, session);
  });
}
export async function resetDeliveryEligible(
  userId: string,
  tokenHash: string,
  now: Date,
) {
  await recoveryDatabase();
  const reset = await findReset(tokenHash, now);
  return (
    !!reset &&
    reset.userId.toString() === userId &&
    !!(await findActiveRecoveryUser(reset.userId, reset.credentialVersion))
  );
}
