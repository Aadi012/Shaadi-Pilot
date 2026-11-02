import 'server-only';
import { Types, type ClientSession } from 'mongoose';
import { ApiError } from '@/lib/api/errors';
import { readAppEnvironment } from '@/lib/config/env.server';
import { loadOrganizerMembership } from '@/modules/auth/service.server';
import {
  hashSecret,
  isSecret,
  newSecret,
} from '@/modules/auth/security.server';
import {
  activeWeddingForMembership,
  lockWeddingMembership,
} from '@/modules/weddings/service.server';
import { invitableGuest } from '@/modules/guests/service.server';
import { invitationEvents as planningEvents } from '@/modules/events/service.server';
import {
  inviteKeySchema,
  objectIdSchema,
} from '@/modules/memberships/contracts';
import {
  prepareEmailQueue,
  queueGuestInvitation,
  guestInvitationMailStates,
  guestReminderMailStates,
} from '@/modules/email/service.server';
import {
  issueInput,
  exchangeInput,
  rsvpInput,
  partySize,
  type InvitationEvent,
  type InvitationState,
  type GuestHubDto,
  type Attendance,
} from './contracts';
import { encryptCapability, decryptCapability } from './security.server';
import * as repository from './repository.server';
const fail = (status: number, code: string, message: string) =>
  new ApiError({ status, code, message });
const invalid = () =>
  fail(
    401,
    'INVALID_OR_EXPIRED_LINK',
    'This invitation is unavailable. Ask your organizer for a new private link.',
  );
async function organizer(
  userId: string,
  expected?: string,
  session?: ClientSession,
) {
  const user = await loadOrganizerMembership(userId, session);
  if (!user) throw fail(401, 'UNAUTHENTICATED', 'Please log in.');
  if (!user.weddingId || !['admin', 'manager'].includes(user.role ?? ''))
    throw fail(403, 'FORBIDDEN', 'Wedding access is unavailable.');
  if (expected && expected !== user.weddingId.toString())
    throw fail(
      409,
      'WEDDING_CONTEXT_CHANGED',
      'Your wedding changed. Reload before continuing.',
    );
  if (!(await activeWeddingForMembership(user.weddingId, session)))
    throw fail(404, 'NOT_FOUND', 'Wedding not found.');
  return user.weddingId;
}
async function eventsForLink(
  link: repository.LinkRecord,
  session?: ClientSession,
): Promise<InvitationEvent[]> {
  const rows = await repository.pairs(link.weddingId, link._id, session);
  if (rows.length > 100)
    throw fail(503, 'SERVICE_UNAVAILABLE', 'Invitation review is unavailable.');
  const events = await planningEvents(
    link.weddingId,
    rows.map((r) => r.eventId),
    session,
  );
  return rows
    .flatMap((row) => {
      const event = events.find((e) => e._id.equals(row.eventId));
      return event
        ? [
            {
              id: row._id.toString(),
              eventId: row.eventId.toString(),
              title: event.title,
              description: event.description ?? '',
              startsAt: event.startsAt.toISOString(),
              endsAt: event.endsAt.toISOString(),
              timezone: event.timezone,
              venue: event.venue,
              status: row.rsvpStatus,
              additionalGuests: row.additionalGuests,
              headcount: partySize(row.rsvpStatus, row.additionalGuests),
              version: row.__v,
              closed: event.startsAt <= new Date(),
            },
          ]
        : [];
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
export async function organizerInvitation(
  userId: string,
  guestId: string,
): Promise<InvitationState> {
  await repository.database();
  const weddingId = await organizer(userId);
  const guest = await invitableGuest(
    weddingId,
    new Types.ObjectId(objectIdSchema.parse(guestId)),
  );
  if (!guest) throw fail(404, 'NOT_FOUND', 'Guest contact not found.');
  const link = await repository.linkForGuest(weddingId, guest._id);
  const states = link?.deliveryId
    ? await guestInvitationMailStates(weddingId, [link.deliveryId])
    : [];
  const reminderStates = link?.reminderDeliveryId
    ? await guestReminderMailStates(weddingId, [link.reminderDeliveryId])
    : [];
  return {
    reminderDelivery: reminderStates[0]?.state ?? 'not-requested',
    weddingId: weddingId.toString(),
    guestId,
    guestVersion: guest.__v,
    link: link
      ? {
          id: link._id.toString(),
          version: link.__v,
          expiresAt: link.expiresAt.toISOString(),
          active: !link.revokedAt && link.expiresAt > new Date(),
        }
      : null,
    invitations: link && !link.revokedAt ? await eventsForLink(link) : [],
    delivery: states[0]?.state ?? 'not-requested',
  };
}
export async function changeInvitation(
  userId: string,
  expectedWedding: string,
  guestId: string,
  action: 'issue' | 'rotate' | 'revoke' | 'send' | 'remind',
  input: unknown,
  key?: string,
  version?: number,
) {
  objectIdSchema.parse(expectedWedding);
  const guestObjectId = new Types.ObjectId(objectIdSchema.parse(guestId));
  const parsed =
    action === 'issue' || action === 'rotate'
      ? issueInput.parse(input)
      : undefined;
  const requestId =
    action === 'revoke'
      ? undefined
      : hashSecret(
          `${userId}:${expectedWedding}:${inviteKeySchema.parse(key)}`,
        );
  const requestHash = hashSecret(
    JSON.stringify({ guestId, action, input: parsed, version }),
  );
  const db = await repository.database();
  if (action === 'send' || action === 'remind') await prepareEmailQueue();
  const outcome = await db.connection.transaction(async (session) => {
    const weddingId = await organizer(userId, expectedWedding, session);
    if (!(await lockWeddingMembership(weddingId, session)))
      throw fail(404, 'NOT_FOUND', 'Wedding not found.');
    const guest = await invitableGuest(weddingId, guestObjectId, session);
    if (!guest) throw fail(404, 'NOT_FOUND', 'Guest contact not found.');
    let link = await repository.linkForGuest(weddingId, guest._id, session);
    if (requestId) {
      const receipt = await repository.receipt(requestId, weddingId, session);
      if (receipt) {
        if (receipt.requestHash !== requestHash)
          throw fail(
            409,
            'IDEMPOTENCY_CONFLICT',
            'This request key was used for another invitation action.',
          );
        if (
          !link ||
          !link._id.equals(receipt.linkId) ||
          link.__v !== receipt.generation ||
          link.revokedAt
        )
          throw fail(
            409,
            'INVITATION_CHANGED',
            'The invitation changed after this request. Refresh and review it.',
          );
        return { deliveryId: receipt.deliveryId?.toString() };
      }
    }
    if (action !== 'issue' && !link)
      throw fail(404, 'NOT_FOUND', 'Invitation not found.');
    if (
      action === 'rotate' ||
      action === 'revoke' ||
      action === 'send' ||
      action === 'remind'
    ) {
      if (link!.__v !== version)
        throw fail(
          412,
          'PRECONDITION_FAILED',
          'Invitation changed. Refresh and review it before continuing.',
        );
    }
    if (action === 'revoke') {
      await repository.revokePairs(weddingId, link!._id, session);
      await repository.revokeLink(weddingId, link!._id, session);
      return {};
    }
    if (parsed && guest.__v !== parsed.guestVersion)
      throw fail(
        412,
        'PRECONDITION_FAILED',
        'The guest or selected functions changed. Reopen their details before inviting.',
      );
    if (
      action === 'issue' &&
      link &&
      (link.revokedAt || link.expiresAt <= new Date())
    )
      throw fail(
        409,
        'INVITATION_INACTIVE',
        'Review the selected functions and explicitly reissue this invitation.',
      );
    if (action === 'rotate' || !link) {
      const events = await planningEvents(
        weddingId,
        guest.selectedEventIds,
        session,
      );
      if (!events.length || events.length !== guest.selectedEventIds.length)
        throw fail(
          409,
          'INVALID_SELECTION',
          'Choose at least one available function before issuing an invitation.',
        );
      const expiresAt = new Date(
        Math.max(...events.map((e) => e.endsAt.getTime())) + 30 * 86400000,
      );
      if (expiresAt <= new Date())
        throw fail(
          409,
          'INVITATION_EXPIRED',
          'These functions are too far in the past to issue an invitation.',
        );
      const id = link?._id ?? new Types.ObjectId(),
        secret = newSecret();
      const next: repository.LinkRecord = {
        _id: id,
        weddingId,
        guestContactId: guest._id,
        tokenHash: hashSecret(secret),
        encrypted: encryptCapability(secret, id.toString()),
        expiresAt,
        revokedAt: null,
        __v: link ? link.__v + 1 : 0,
      };
      if (link) await repository.revokePairs(weddingId, id, session);
      await repository.saveLink(next, !!link, session);
      for (const event of events)
        await repository.activatePair(
          weddingId,
          id,
          guest._id,
          event._id,
          session,
        );
      link = next;
    }
    let deliveryId: Types.ObjectId | undefined;
    if (action === 'send' || action === 'remind') {
      if (link!.revokedAt || link!.expiresAt <= new Date())
        throw fail(
          409,
          'INVITATION_INACTIVE',
          'Reissue an active invitation before sending.',
        );
      const secretLink = await repository.privateLink(
        weddingId,
        link!._id,
        session,
      );
      const wedding = await activeWeddingForMembership(weddingId, session);
      const allInvitations = await eventsForLink(link!, session);
      const invitations =
        action === 'remind'
          ? allInvitations.filter((e) => e.status === 'pending' && !e.closed)
          : allInvitations;
      if (!invitations.length)
        throw fail(
          409,
          'INVITATION_INACTIVE',
          'No active invitations are available.',
        );
      deliveryId = new Types.ObjectId();
      await queueGuestInvitation(
        {
          id: deliveryId,
          weddingId,
          guestId: guest._id,
          recipient: guest.emailNormalized,
          tokenHash: secretLink!.tokenHash,
          link: capabilityUrl(
            link!._id.toString(),
            decryptCapability(secretLink!.encrypted, link!._id.toString()),
          ),
          guestName: guest.displayName,
          couple: `${wedding!.displayNames.partnerOne} & ${wedding!.displayNames.partnerTwo}`,
          functions: invitations.map((e) => e.title),
          expiresAt:
            action === 'remind'
              ? new Date(
                  Math.min(
                    link!.expiresAt.getTime(),
                    ...invitations.map((e) => Date.parse(e.startsAt)),
                  ),
                )
              : link!.expiresAt,
          ...(action === 'remind'
            ? {
                reminderEventIds: invitations.map(
                  (e) => new Types.ObjectId(e.eventId),
                ),
              }
            : {}),
        },
        session,
      );
      await (
        action === 'remind'
          ? repository.setReminderDelivery
          : repository.setDelivery
      )(weddingId, link!._id, deliveryId, session);
    }
    await repository.saveReceipt(
      {
        _id: requestId!,
        weddingId,
        requestHash,
        linkId: link!._id,
        generation: link!.__v,
        deliveryId,
      },
      session,
    );
    return { deliveryId: deliveryId?.toString() };
  });
  return { ...(await organizerInvitation(userId, guestId)), ...outcome };
}
function capabilityUrl(id: string, secret: string) {
  const url = new URL('/invitation', readAppEnvironment().APP_BASE_URL);
  url.hash = new URLSearchParams({ publicId: id, secret }).toString();
  return url.toString();
}
export async function shareInvitation(
  userId: string,
  expectedWedding: string,
  guestId: string,
) {
  const db = await repository.database();
  return db.connection.transaction(async (session) => {
    const weddingId = await organizer(
      userId,
      objectIdSchema.parse(expectedWedding),
      session,
    );
    const guest = await invitableGuest(
      weddingId,
      new Types.ObjectId(objectIdSchema.parse(guestId)),
      session,
    );
    if (!guest) throw fail(404, 'NOT_FOUND', 'Guest contact not found.');
    const row = await repository.linkForGuest(weddingId, guest._id, session);
    if (!row || row.revokedAt || row.expiresAt <= new Date())
      throw fail(
        409,
        'INVITATION_INACTIVE',
        'Issue an active invitation first.',
      );
    const link = await repository.privateLink(weddingId, row._id, session);
    return {
      weddingId: weddingId.toString(),
      link: capabilityUrl(
        row._id.toString(),
        decryptCapability(link!.encrypted, row._id.toString()),
      ),
    };
  });
}
async function validateLink(
  link: repository.LinkRecord | null,
  session?: ClientSession,
) {
  if (!link || link.revokedAt || link.expiresAt <= new Date()) throw invalid();
  const wedding = await activeWeddingForMembership(link.weddingId, session);
  const guest = await invitableGuest(
    link.weddingId,
    link.guestContactId,
    session,
  );
  if (!wedding || !guest) throw invalid();
  return { link, wedding, guest };
}
export async function exchangeInvitation(input: unknown) {
  const data = exchangeInput.parse(input),
    db = await repository.database();
  const token = newSecret();
  return db.connection.transaction(async (session) => {
    const record = await repository.linkById(
      new Types.ObjectId(data.publicId),
      session,
      true,
    );
    if (!record || hashSecret(data.secret) !== record.tokenHash)
      throw invalid();
    if (!(await lockWeddingMembership(record.weddingId, session)))
      throw invalid();
    const { link } = await validateLink(record, session);
    const expiresAt = new Date(
      Math.min(Date.now() + 7 * 86400000, link.expiresAt.getTime()),
    );
    await repository.createSession(
      {
        weddingId: link.weddingId,
        linkId: link._id,
        generation: link.__v,
        tokenHash: hashSecret(token),
        expiresAt,
      },
      session,
    );
    return { token, expiresAt };
  });
}
export async function guestPrincipal(
  token: string | undefined,
  session?: ClientSession,
) {
  if (!isSecret(token)) throw invalid();
  await repository.database();
  const entry = await repository.findSession(hashSecret(token), session);
  if (!entry) throw invalid();
  const link = await repository.linkById(entry.linkId, session);
  if (
    !link ||
    !link.weddingId.equals(entry.weddingId) ||
    link.__v !== entry.generation
  )
    throw invalid();
  return { ...(await validateLink(link, session)), token };
}
export async function guestHub(
  token: string | undefined,
): Promise<GuestHubDto> {
  const { link, wedding, guest } = await guestPrincipal(token);
  return {
    context: link._id.toString(),
    guestName: guest.displayName,
    couple: `${wedding.displayNames.partnerOne} & ${wedding.displayNames.partnerTwo}`,
    expiresAt: link.expiresAt.toISOString(),
    invitations: await eventsForLink(link),
  };
}
export async function saveRsvp(
  token: string | undefined,
  context: string | null,
  input: unknown,
  version: number,
) {
  const data = rsvpInput.parse(input),
    db = await repository.database();
  return db.connection.transaction(async (session) => {
    const principal = await guestPrincipal(token, session);
    if (principal.link._id.toString() !== context)
      throw fail(
        409,
        'GUEST_CONTEXT_CHANGED',
        'Another invitation was opened. Reopen your original private link before saving this response.',
      );
    if (!(await lockWeddingMembership(principal.link.weddingId, session)))
      throw invalid();
    const rows = await repository.pairs(
      principal.link.weddingId,
      principal.link._id,
      session,
    );
    const row = rows.find((r) => r._id.toString() === data.invitationId);
    if (!row || !row.guestContactId.equals(principal.guest._id))
      throw fail(404, 'NOT_FOUND', 'Invited function not found.');
    const [event] = await planningEvents(
      principal.link.weddingId,
      [row.eventId],
      session,
    );
    if (!event) throw invalid();
    if (event.startsAt <= new Date())
      throw fail(
        409,
        'RSVP_CLOSED',
        'RSVP changes closed when this function started. Contact your organizer for help.',
      );
    if (
      row.rsvpStatus === data.status &&
      row.additionalGuests === data.additionalGuests
    )
      return (await eventsForLink(principal.link, session)).find(
        (e) => e.id === data.invitationId,
      )!;
    if (row.__v !== version)
      throw fail(
        412,
        'PRECONDITION_FAILED',
        'This response changed in another tab. Your draft is kept. Reload and review before saving.',
      );
    if (
      !(await repository.updateRsvp(
        row,
        data.status,
        data.additionalGuests,
        session,
      ))
    )
      throw fail(
        412,
        'PRECONDITION_FAILED',
        'This response changed. Reload and review it.',
      );
    return (await eventsForLink(principal.link, session)).find(
      (e) => e.id === data.invitationId,
    )!;
  });
}
export async function endGuestSession(token: string | undefined) {
  if (!isSecret(token)) return;
  const db = await repository.database();
  await db.connection.transaction(async (session) => {
    const entry = await repository.findSession(hashSecret(token), session);
    if (entry) await lockWeddingMembership(entry.weddingId, session);
    await repository.deleteSession(hashSecret(token), session);
  });
}
export async function guestEmailEligible(
  guestId: string,
  tokenHash: string,
  now: Date,
  weddingId?: string,
  reminderEventIds?: string[],
) {
  if (!weddingId) return false;
  const tenant = new Types.ObjectId(weddingId);
  const link = await repository.linkForGuest(
    tenant,
    new Types.ObjectId(guestId),
  );
  if (!link || link.revokedAt || link.expiresAt <= now) return false;
  const db = await repository.database();
  return db.connection.transaction(async (session) => {
    const full = await repository.privateLink(tenant, link._id, session);
    if (
      !full ||
      full.tokenHash !== tokenHash ||
      full.revokedAt ||
      full.expiresAt <= now
    )
      return false;
    if (
      !(await activeWeddingForMembership(tenant, session)) ||
      !(await invitableGuest(tenant, link.guestContactId, session))
    )
      return false;
    const invitations = await eventsForLink(full, session);
    return reminderEventIds?.length
      ? reminderEventIds.every((id) =>
          invitations.some(
            (e) =>
              e.eventId === id &&
              e.status === 'pending' &&
              Date.parse(e.startsAt) > now.getTime(),
          ),
        )
      : invitations.length > 0;
  });
}
export async function attendanceOverview(
  weddingId: string,
): Promise<Attendance[]> {
  const tenant = new Types.ObjectId(weddingId);
  const rows = await repository.activeAttendance(tenant);
  const events = await planningEvents(
    tenant,
    rows.map((r) => r._id),
  );
  return rows.flatMap((row) => {
    const event = events.find((e) => e._id.equals(row._id));
    return event
      ? [
          {
            eventId: row._id.toString(),
            title: event.title,
            pending: row.pending,
            attending: row.attending,
            declined: row.declined,
            headcount: row.headcount,
          },
        ]
      : [];
  });
}

export async function guestReminderEligible(
  guestId: string,
  tokenHash: string,
  now: Date,
  weddingId?: string,
  eventIds?: string[],
) {
  return (
    !!eventIds?.length &&
    guestEmailEligible(guestId, tokenHash, now, weddingId, eventIds)
  );
}
export async function functionRoster(
  userId: string,
  eventId: string,
  cursor?: string,
) {
  await repository.database();
  const weddingId = await organizer(userId);
  const [event] = await planningEvents(weddingId, [
    new Types.ObjectId(objectIdSchema.parse(eventId)),
  ]);
  if (!event) throw fail(404, 'NOT_FOUND', 'Function not found.');
  let after: Types.ObjectId | undefined;
  if (cursor) {
    const parts = cursor.split(':');
    if (
      parts.length !== 3 ||
      parts[0] !== weddingId.toString() ||
      parts[1] !== eventId
    )
      throw fail(
        400,
        'INVALID_QUERY',
        'Refresh the roster before loading more.',
      );
    after = new Types.ObjectId(objectIdSchema.parse(parts[2]));
  }
  const page = await repository.eventPairs(weddingId, event._id, after);
  const rows = [];
  for (const pair of page.slice(0, 50)) {
    const guest = await invitableGuest(weddingId, pair.guestContactId);
    if (!guest) continue;
    const link = await repository.linkForGuest(weddingId, guest._id);
    const active =
      !!link &&
      link._id.equals(pair.linkId) &&
      !link.revokedAt &&
      !pair.revokedAt &&
      link.expiresAt > new Date();
    rows.push({
      id: pair._id.toString(),
      guestId: guest._id.toString(),
      name: guest.displayName,
      email: guest.emailNormalized,
      status: pair.rsvpStatus,
      headcount: partySize(pair.rsvpStatus, pair.additionalGuests),
      active,
    });
  }
  return {
    weddingId: weddingId.toString(),
    eventId,
    title: event.title,
    rows,
    nextCursor:
      page.length > 50 ? weddingId + ':' + eventId + ':' + page[49]._id : null,
  };
}
