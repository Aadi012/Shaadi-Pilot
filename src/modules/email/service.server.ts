import 'server-only';
import { Types, type ClientSession } from 'mongoose';
import { hashSecret } from '@/modules/auth/security.server';
import { encryptEmail, decryptEmail } from './crypto.server';
import { emailEnvironment } from './config.server';
import { resetEmail } from './template';
import {
  claimDelivery,
  emailDatabase,
  findBatch,
  finishDelivery,
  insertDelivery,
  markAttempt,
} from './repository.server';
import { sendResendBatch } from './provider.server';
export const prepareEmailQueue = emailDatabase;
export async function queueResetEmail(
  userId: Types.ObjectId,
  recipient: string,
  token: string,
  expiresAt: Date,
  session: ClientSession,
) {
  const { from, baseUrl } = emailEnvironment();
  const id = new Types.ObjectId();
  const link = new URL('/reset-password', baseUrl);
  link.hash = `token=${token}`;
  const payload = JSON.stringify([
    { from, to: [recipient], ...resetEmail(link.toString()) },
  ]);
  await insertDelivery(
    {
      _id: id,
      userId,
      tokenHash: hashSecret(token),
      logicalKey: `password-reset/${id}`,
      scope: 'platform',
      kind: 'password-reset',
      state: 'pending',
      attempts: 0,
      nextAttemptAt: new Date(),
      leaseUntil: null,
      leaseOwner: null,
      expiresAt,
      purgeAt: new Date(expiresAt.getTime() + 7 * 86400000),
    },
    {
      payloadHash: hashSecret(payload),
      encrypted: encryptEmail(payload, id.toString()),
    },
    session,
  );
  return id.toString();
}
type Eligible = (
  userId: string,
  tokenHash: string,
  now: Date,
) => Promise<boolean>;
export async function dispatchResetEmails(
  eligible: Eligible,
  options: { id?: string; limit?: number } = {},
  send = sendResendBatch,
) {
  await emailDatabase();
  emailEnvironment();
  const counts = {
    submitted: 0,
    retry: 0,
    failed: 0,
    cancelled: 0,
    quarantined: 0,
  };
  for (let index = 0; index < Math.min(options.limit ?? 5, 5); index++) {
    const delivery = await claimDelivery(new Date(), options.id);
    if (!delivery) break;
    if (delivery.attempts > 5) {
      await finishDelivery(delivery, 'failed', {
        lastError: 'attempts_exhausted',
      });
      counts.failed++;
      continue;
    }
    const now = new Date();
    if (
      delivery.expiresAt <= now ||
      !(await eligible(delivery.userId.toString(), delivery.tokenHash, now))
    ) {
      await finishDelivery(delivery, 'cancelled');
      counts.cancelled++;
      continue;
    }
    if (
      delivery.firstAttemptAt &&
      now.getTime() - delivery.firstAttemptAt.getTime() >= 23 * 3600000
    ) {
      await finishDelivery(delivery, 'quarantined', {
        lastError: 'deduplication_window',
      });
      counts.quarantined++;
      continue;
    }
    const batch = await findBatch(delivery._id);
    let payload: string;
    try {
      if (!batch?.encrypted) throw new Error();
      payload = decryptEmail(batch.encrypted, delivery._id.toString());
      if (hashSecret(payload) !== batch.payloadHash) throw new Error();
    } catch {
      await finishDelivery(delivery, 'failed', {
        lastError: 'payload_unavailable',
      });
      counts.failed++;
      continue;
    }
    if (!(await markAttempt(delivery, now)).matchedCount) continue;
    const result = await send(payload, batch!.idempotencyKey);
    const kind =
      result.kind === 'retry' && delivery.attempts >= 5
        ? 'failed'
        : result.kind;
    await finishDelivery(
      delivery,
      kind,
      result.kind === 'submitted'
        ? { providerMessageId: result.id }
        : {
            lastError: result.category,
            ...(kind === 'retry'
              ? {
                  nextAttemptAt: new Date(
                    Date.now() +
                      Math.min(600000, 30000 * 2 ** (delivery.attempts - 1)),
                  ),
                }
              : {}),
          },
    );
    counts[kind]++;
  }
  return counts;
}
