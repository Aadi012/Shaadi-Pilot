import 'server-only';
import { Types, type ClientSession } from 'mongoose';
import { hashSecret } from '@/modules/auth/security.server';
import { encryptEmail, decryptEmail } from './crypto.server';
import { emailEnvironment } from './config.server';
import {
  resetEmail,
  managerInviteEmail,
  guestInviteEmail,
  guestReminderEmail,
} from './template';
import {
  claimDelivery,
  emailDatabase,
  findBatch,
  finishDelivery,
  insertDelivery,
  markAttempt,
  weddingDeliveryStates,
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
  weddingId?: string,
  reminderEventIds?: string[],
) => Promise<boolean>;
async function dispatchKind(
  kind: 'password-reset' | 'member-invite' | 'guest-invite' | 'guest-reminder',
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
    const delivery = await claimDelivery(new Date(), options.id, kind);
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
      !(await eligible(
        delivery.userId.toString(),
        delivery.tokenHash,
        now,
        delivery.weddingId?.toString(),
        delivery.reminderEventIds?.map((id) => id.toString()),
      ))
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
    const outcome =
      result.kind === 'retry' && delivery.attempts >= 5
        ? 'failed'
        : result.kind;
    await finishDelivery(
      delivery,
      outcome,
      result.kind === 'submitted'
        ? { providerMessageId: result.id }
        : {
            lastError: result.category,
            ...(outcome === 'retry'
              ? {
                  nextAttemptAt: new Date(
                    Date.now() +
                      Math.min(600000, 30000 * 2 ** (delivery.attempts - 1)),
                  ),
                }
              : {}),
          },
    );
    counts[outcome]++;
  }
  return counts;
}
export const dispatchResetEmails = (
  eligible: Eligible,
  options: { id?: string; limit?: number } = {},
  send = sendResendBatch,
) => dispatchKind('password-reset', eligible, options, send);
export const dispatchInvitationEmails = (
  eligible: Eligible,
  options: { id?: string; limit?: number } = {},
  send = sendResendBatch,
) => dispatchKind('member-invite', eligible, options, send);
export const invitationMailStates = weddingDeliveryStates;
export const guestInvitationMailStates = (
  weddingId: Types.ObjectId,
  ids: Types.ObjectId[],
) => weddingDeliveryStates(weddingId, ids, 'guest-invite');
export const dispatchGuestEmails = (
  eligible: Eligible,
  options: { id?: string; limit?: number } = {},
  send = sendResendBatch,
) => dispatchKind('guest-invite', eligible, options, send);
export async function queueGuestInvitation(
  data: {
    id: Types.ObjectId;
    weddingId: Types.ObjectId;
    guestId: Types.ObjectId;
    recipient: string;
    tokenHash: string;
    link: string;
    guestName: string;
    couple: string;
    functions: string[];
    expiresAt: Date;
    reminderEventIds?: Types.ObjectId[];
  },
  session: ClientSession,
) {
  const { from } = emailEnvironment();
  const payload = JSON.stringify([
    {
      from,
      to: [data.recipient],
      ...(data.reminderEventIds ? guestReminderEmail : guestInviteEmail)(
        data.link,
        data.guestName,
        data.couple,
        data.functions,
      ),
    },
  ]);
  await insertDelivery(
    {
      _id: data.id,
      scope: 'wedding',
      kind: data.reminderEventIds ? 'guest-reminder' : 'guest-invite',
      reminderEventIds: data.reminderEventIds,
      weddingId: data.weddingId,
      userId: data.guestId,
      tokenHash: data.tokenHash,
      logicalKey: `${data.reminderEventIds ? 'guest-reminder' : 'guest-invite'}/${data.id}`,
      state: 'pending',
      attempts: 0,
      nextAttemptAt: new Date(),
      leaseUntil: null,
      leaseOwner: null,
      expiresAt: data.expiresAt,
      purgeAt: new Date(data.expiresAt.getTime() + 7 * 86400000),
    },
    {
      payloadHash: hashSecret(payload),
      encrypted: encryptEmail(payload, data.id.toString()),
    },
    session,
  );
}
export async function queueManagerInvitation(
  data: {
    id: Types.ObjectId;
    weddingId: Types.ObjectId;
    inviterId: Types.ObjectId;
    recipient: string;
    couple: string;
    token: string;
    expiresAt: Date;
  },
  session: ClientSession,
) {
  const { from, baseUrl } = emailEnvironment();
  const link = new URL('/join', baseUrl);
  link.hash = `token=${data.token}`;
  const payload = JSON.stringify([
    {
      from,
      to: [data.recipient],
      ...managerInviteEmail(link.toString(), data.couple),
    },
  ]);
  await insertDelivery(
    {
      _id: data.id,
      scope: 'wedding',
      kind: 'member-invite',
      weddingId: data.weddingId,
      userId: data.inviterId,
      tokenHash: hashSecret(data.token),
      logicalKey: `member-invite/${data.id}`,
      state: 'pending',
      attempts: 0,
      nextAttemptAt: new Date(),
      leaseUntil: null,
      leaseOwner: null,
      expiresAt: data.expiresAt,
      purgeAt: new Date(data.expiresAt.getTime() + 7 * 86400000),
    },
    {
      payloadHash: hashSecret(payload),
      encrypted: encryptEmail(payload, data.id.toString()),
    },
    session,
  );
}

export const dispatchGuestReminders = (
  eligible: Eligible,
  options: { id?: string; limit?: number } = {},
  send = sendResendBatch,
) => dispatchKind('guest-reminder', eligible, options, send);
export const guestReminderMailStates = (
  weddingId: Types.ObjectId,
  ids: Types.ObjectId[],
) => weddingDeliveryStates(weddingId, ids, 'guest-reminder');
