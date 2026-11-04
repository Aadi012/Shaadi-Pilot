import nextEnv from '@next/env';
import mongoose, { Types } from 'mongoose';
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
const context = vi.hoisted(() => ({ cookie: '' }));
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    has: (name: string) =>
      context.cookie.split('; ').some((value) => value.startsWith(name + '=')),
    get: (name: string) => {
      const pair = context.cookie
        .split('; ')
        .find((value) => value.startsWith(name + '='));
      return pair ? { value: pair.slice(name.length + 1) } : undefined;
    },
  }),
}));
import { authIndexes } from '@/modules/auth/indexes';
import { weddingIndexes } from '@/modules/weddings/indexes';
import { emailIndexes } from '@/modules/email/indexes';
import { membershipIndexes } from '@/modules/memberships/indexes';
import { User, Session } from '@/modules/auth/models.server';
import { Wedding } from '@/modules/weddings/models.server';
import {
  MemberInvite,
  MemberInviteRequest,
} from '@/modules/memberships/models.server';
import { EmailDelivery, EmailBatch } from '@/modules/email/models.server';
import {
  hashSecret,
  newSecret,
  hashPassword,
} from '@/modules/auth/security.server';
import { decryptEmail } from '@/modules/email/crypto.server';
import { dispatchInvitationEmails } from '@/modules/email/service.server';
import {
  createInvitation,
  invitations,
  members,
  revokeInvitation,
  invitationView,
  acceptInvitation,
  invitationEmailEligible,
  removeManager,
} from '@/modules/memberships/service.server';
import {
  stageInvitationHandler,
  clearInvitationHandler,
  acceptInvitationHandler,
  createInvitationHandler,
  membersHandler,
  invitationsHandler,
  removeManagerHandler,
} from '@/modules/memberships/http.server';
import {
  authHandler,
  sessionHandler,
  cookieNames,
} from '@/modules/auth/http.server';
import {
  invitationCookieName,
  invitationCookieOptions,
} from '@/modules/memberships/context.server';
import * as inviteRepository from '@/modules/memberships/repository.server';
import { findSession } from '@/modules/auth/repository.server';
import {
  writeEvent,
  listEvents,
  readEvent,
} from '@/modules/events/service.server';
import {
  writeTask,
  listTasks,
  readTask,
  taskOverview,
  taskOptions,
} from '@/modules/tasks/service.server';
import { taskIndexes } from '@/modules/tasks/indexes';
import {
  writeGuest,
  listGuests,
  readGuest,
} from '@/modules/guests/service.server';
import { guestIndexes } from '@/modules/guests/indexes';
import sharp from 'sharp';
import { expenseIndexes } from '@/modules/expenses/indexes';
import { vendorIndexes } from '@/modules/vendors/indexes';
import {
  writeExpense,
  listExpenses,
  readExpense,
  expenseSummary,
} from '@/modules/expenses/service.server';
import {
  writeVendor,
  listVendors,
  readVendor,
} from '@/modules/vendors/service.server';
import { weddingOverview } from '@/modules/dashboard/service.server';
import { galleryIndexes } from '@/modules/gallery/indexes';
import {
  createUpload,
  completeUpload,
  listPhotos,
  photoView,
  removePhoto,
  cleanupPhotos,
} from '@/modules/gallery/service.server';
import type { PhotoStorage } from '@/modules/gallery/storage.server';
import { MAX_PHOTO_BYTES } from '@/modules/gallery/contracts';
import { invitationIndexes } from '@/modules/invitations/indexes';
import {
  changeInvitation,
  organizerInvitation,
  shareInvitation,
  exchangeInvitation,
  guestHub,
  saveRsvp,
  endGuestSession,
  attendanceOverview,
  guestEmailEligible,
  guestReminderEligible,
  functionRoster,
} from '@/modules/invitations/service.server';
import {
  dispatchGuestEmails,
  dispatchGuestReminders,
} from '@/modules/email/service.server';
import { workspaceCounts } from '@/modules/dashboard/repository.server';
async function invitationFixture(
  scope: Awaited<ReturnType<typeof wedding>>,
  email = 'guest@example.test',
) {
  const startsAt = new Date(Date.now() + 3 * 86400000).toISOString();
  const event = await writeEvent(
    scope.adminId,
    scope.weddingId,
    {
      title: 'Private celebration',
      description: 'A family celebration',
      startsAt,
      endsAt: new Date(Date.parse(startsAt) + 3600000).toISOString(),
      timezone: 'Asia/Kolkata',
      venue: { name: 'Private venue', address: 'Venue address' },
    },
    undefined,
    undefined,
    false,
    randomUUID(),
  );
  const guest = await writeGuest(
    scope.adminId,
    scope.weddingId,
    {
      displayName: 'Invited family',
      email,
      notes: 'Never public',
      selectedEventIds: [event.id],
    },
    { key: randomUUID() },
  );
  return { event, guest };
}
async function issuedFixture(
  scope: Awaited<ReturnType<typeof wedding>>,
  email?: string,
) {
  const fixture = await invitationFixture(scope, email);
  const issued = await changeInvitation(
    scope.adminId,
    scope.weddingId,
    fixture.guest.id,
    'issue',
    { guestVersion: fixture.guest.version },
    randomUUID(),
  );
  const shared = await shareInvitation(
    scope.adminId,
    scope.weddingId,
    fixture.guest.id,
  );
  const params = new URLSearchParams(new URL(shared.link).hash.slice(1));
  const capability = {
    publicId: params.get('publicId')!,
    secret: params.get('secret')!,
  };
  const session = await exchangeInvitation(capability);
  return { ...fixture, issued, shared, capability, token: session.token };
}

const database = 'sp_mem_test_' + randomUUID().replaceAll('-', '').slice(0, 24);
let sequence = 0;
const password = 'Isolated manager test passphrase!';
beforeAll(async () => {
  const previous = process.env.NODE_ENV;
  vi.stubEnv('NODE_ENV', 'development');
  nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  vi.stubEnv('NODE_ENV', previous);
  process.env.MONGODB_DB_NAME = database;
  process.env.APP_BASE_URL = 'http://localhost:3000';
  process.env.RESEND_API_KEY = 're_mock_only';
  process.env.RESEND_FROM_EMAIL = 'test@example.test';
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  process.env.TOKEN_ENCRYPTION_KEY_ID = 'test-v1';
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    if (!process.env.MONGODB_URI) throw new Error();
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: database,
      autoIndex: false,
      serverSelectionTimeoutMS: 8000,
    });
    for (const { collection, key, ...options } of [
      ...authIndexes,
      ...weddingIndexes,
      ...emailIndexes,
      ...membershipIndexes,
      ...taskIndexes,
      ...guestIndexes,
      ...invitationIndexes,
      ...galleryIndexes,
      ...expenseIndexes,
      ...vendorIndexes,
    ])
      await mongoose.connection
        .collection(collection)
        .createIndex(key, options);
  } catch {
    throw new Error(
      'Isolated membership test setup failed; connection details withheld.',
    );
  }
});
describe('Private guest invitation hub and per-function RSVP', () => {
  it('shows multiple explicitly invited functions on one link with independent responses', async () => {
    const scope = await wedding(),
      first = await invitationFixture(scope),
      second = await invitationFixture(scope);
    const guest = await writeGuest(
      scope.adminId,
      scope.weddingId,
      { selectedEventIds: [first.event.id, second.event.id] },
      { id: first.guest.id, version: first.guest.version },
    );
    await changeInvitation(
      scope.adminId,
      scope.weddingId,
      guest.id,
      'issue',
      { guestVersion: guest.version },
      randomUUID(),
    );
    const link = await shareInvitation(
      scope.adminId,
      scope.weddingId,
      guest.id,
    );
    const session = await exchangeInvitation(
      Object.fromEntries(new URLSearchParams(new URL(link.link).hash.slice(1))),
    );
    const hub = await guestHub(session.token);
    expect(hub.invitations).toHaveLength(2);
    const a = hub.invitations.find((e) => e.eventId === first.event.id)!,
      b = hub.invitations.find((e) => e.eventId === second.event.id)!;
    await saveRsvp(
      session.token,
      hub.context,
      { invitationId: a.id, status: 'attending', additionalGuests: 15 },
      a.version,
    );
    await saveRsvp(
      session.token,
      hub.context,
      { invitationId: b.id, status: 'declined', additionalGuests: 0 },
      b.version,
    );
    const result = await guestHub(session.token);
    expect(result.invitations.find((e) => e.id === a.id)).toMatchObject({
      status: 'attending',
      headcount: '16',
    });
    expect(result.invitations.find((e) => e.id === b.id)).toMatchObject({
      status: 'declined',
      headcount: '0',
    });
  });
  it('requires explicit issue, supports Managers and isolates shared-email contacts and their functions', async () => {
    const scope = await wedding(),
      fixture = await invitationFixture(scope, 'shared@example.test');
    expect(
      (await organizerInvitation(scope.adminId, fixture.guest.id)).link,
    ).toBeNull();
    await expect(
      exchangeInvitation({ publicId: fixture.guest.id, secret: newSecret() }),
    ).rejects.toMatchObject({ code: 'INVALID_OR_EXPIRED_LINK' });
    const manager = await user();
    await User.updateOne(
      { _id: manager._id },
      { $set: { weddingId: scope.wedding._id, role: 'manager' } },
    );
    const state = await changeInvitation(
      manager._id.toString(),
      scope.weddingId,
      fixture.guest.id,
      'issue',
      { guestVersion: fixture.guest.version },
      randomUUID(),
    );
    const other = await issuedFixture(scope, 'shared@example.test');
    const hub = await guestHub(other.token);
    expect(hub.invitations.map((e) => e.eventId)).toEqual([other.event.id]);
    const serialized = JSON.stringify(hub);
    expect(serialized).not.toContain('shared@example.test');
    expect(serialized).not.toContain('Never public');
    expect(serialized).not.toContain('tokenHash');
    await expect(
      saveRsvp(
        other.token,
        hub.context,
        {
          invitationId: state.invitations[0].id,
          status: 'attending',
          additionalGuests: 0,
        },
        state.invitations[0].version,
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      saveRsvp(
        other.token,
        state.link!.id,
        {
          invitationId: hub.invitations[0].id,
          status: 'attending',
          additionalGuests: 0,
        },
        hub.invitations[0].version,
      ),
    ).rejects.toMatchObject({ code: 'GUEST_CONTEXT_CHANGED' });
  });
  it('issues and queues email idempotently without resetting responses, storing secrets only encrypted or hashed', async () => {
    const scope = await wedding(),
      f = await issuedFixture(scope);
    expect(Date.parse(f.issued.link!.expiresAt)).toBe(
      Date.parse(f.event.endsAt) + 30 * 86400000,
    );
    const hub = await guestHub(f.token),
      row = hub.invitations[0];
    await saveRsvp(
      f.token,
      hub.context,
      { invitationId: row.id, status: 'attending', additionalGuests: 15 },
      row.version,
    );
    const issueKey = randomUUID();
    const requests = await Promise.all(
      [0, 1].map(() =>
        changeInvitation(
          scope.adminId,
          scope.weddingId,
          f.guest.id,
          'issue',
          { guestVersion: f.guest.version },
          issueKey,
        ),
      ),
    );
    expect(requests[0].link!.id).toBe(f.issued.link!.id);
    expect(requests[1].invitations[0].headcount).toBe('16');
    const key = randomUUID();
    const sent = await changeInvitation(
      scope.adminId,
      scope.weddingId,
      f.guest.id,
      'send',
      undefined,
      key,
      f.issued.link!.version,
    );
    const replay = await changeInvitation(
      scope.adminId,
      scope.weddingId,
      f.guest.id,
      'send',
      undefined,
      key,
      f.issued.link!.version,
    );
    expect(replay.deliveryId).toBe(sent.deliveryId);
    expect(
      await EmailDelivery.countDocuments({
        weddingId: scope.wedding._id,
        kind: 'guest-invite',
      }),
    ).toBe(1);
    const batch = await EmailBatch.findById(sent.deliveryId)
      .select('+encrypted')
      .lean();
    const mail = JSON.parse(
      decryptEmail(batch!.encrypted!, batch!._id.toString()),
    )[0];
    expect(mail.to).toEqual(['guest@example.test']);
    expect(mail.text).toContain(f.shared.link);
    const raw = await mongoose.connection
      .collection('guestInvitationLinks')
      .findOne({ _id: new Types.ObjectId(f.issued.link!.id) });
    expect(JSON.stringify(raw)).not.toContain(f.capability.secret);
    expect(raw!.tokenHash).toBe(hashSecret(f.capability.secret));
    const send = vi
      .fn()
      .mockResolvedValue({ kind: 'submitted', id: 'guest_mock_accepted' });
    await dispatchGuestEmails(
      guestEmailEligible,
      { id: sent.deliveryId },
      send,
    );
    expect(send).toHaveBeenCalledOnce();
    expect(
      (await organizerInvitation(scope.adminId, f.guest.id)).delivery,
    ).toBe('submitted');
    await expect(
      changeInvitation(
        scope.adminId,
        scope.weddingId,
        f.guest.id,
        'issue',
        { guestVersion: f.guest.version },
        key,
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
  it('revokes old links and sessions, permits reviewed contact changes, and reissues only reviewed functions', async () => {
    const scope = await wedding(),
      f = await issuedFixture(scope);
    const hub = await guestHub(f.token),
      row = hub.invitations[0];
    await saveRsvp(
      f.token,
      hub.context,
      { invitationId: row.id, status: 'attending', additionalGuests: 2 },
      row.version,
    );
    await expect(
      writeGuest(
        scope.adminId,
        scope.weddingId,
        { email: 'changed@example.test' },
        { id: f.guest.id, version: f.guest.version },
      ),
    ).rejects.toMatchObject({ code: 'GUEST_HAS_ACCESS' });
    await changeInvitation(
      scope.adminId,
      scope.weddingId,
      f.guest.id,
      'revoke',
      undefined,
      undefined,
      f.issued.link!.version,
    );
    await expect(guestHub(f.token)).rejects.toMatchObject({
      code: 'INVALID_OR_EXPIRED_LINK',
    });
    await expect(exchangeInvitation(f.capability)).rejects.toMatchObject({
      code: 'INVALID_OR_EXPIRED_LINK',
    });
    await expect(
      saveRsvp(
        f.token,
        hub.context,
        { invitationId: row.id, status: 'declined', additionalGuests: 0 },
        row.version,
      ),
    ).rejects.toMatchObject({ status: 401 });
    const changed = await writeGuest(
      scope.adminId,
      scope.weddingId,
      { email: 'changed@example.test' },
      { id: f.guest.id, version: f.guest.version },
    );
    const revoked = await organizerInvitation(scope.adminId, f.guest.id);
    await changeInvitation(
      scope.adminId,
      scope.weddingId,
      f.guest.id,
      'rotate',
      { guestVersion: changed.version },
      randomUUID(),
      revoked.link!.version,
    );
    const link = await shareInvitation(
      scope.adminId,
      scope.weddingId,
      f.guest.id,
    );
    expect(link.link).not.toBe(f.shared.link);
    const params = new URLSearchParams(new URL(link.link).hash.slice(1));
    const fresh = await exchangeInvitation(Object.fromEntries(params));
    expect((await guestHub(fresh.token)).invitations[0].headcount).toBe('3');
    await expect(guestHub(f.token)).rejects.toMatchObject({ status: 401 });
    const raw = await mongoose.connection
      .collection('eventInvitations')
      .findOne({ _id: new Types.ObjectId(row.id) });
    expect(raw!.rsvpStatus).toBe('attending');
  });
  it('enforces tenant, membership, stale review and optimistic link versions', async () => {
    const scope = await wedding(),
      foreign = await wedding(),
      f = await issuedFixture(scope);
    await expect(
      organizerInvitation(foreign.adminId, f.guest.id),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      shareInvitation(foreign.adminId, foreign.weddingId, f.guest.id),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      changeInvitation(
        scope.adminId,
        foreign.weddingId,
        f.guest.id,
        'revoke',
        undefined,
        undefined,
        f.issued.link!.version,
      ),
    ).rejects.toMatchObject({ code: 'WEDDING_CONTEXT_CHANGED' });
    await expect(
      changeInvitation(
        scope.adminId,
        scope.weddingId,
        f.guest.id,
        'rotate',
        { guestVersion: f.guest.version + 1 },
        randomUUID(),
        f.issued.link!.version,
      ),
    ).rejects.toMatchObject({ status: 412 });
    const rotations = await Promise.allSettled(
      [0, 1].map(() =>
        changeInvitation(
          scope.adminId,
          scope.weddingId,
          f.guest.id,
          'rotate',
          { guestVersion: f.guest.version },
          randomUUID(),
          f.issued.link!.version,
        ),
      ),
    );
    expect(rotations.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(rotations.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { status: 412 },
    });
    const manager = await user();
    await User.updateOne(
      { _id: manager._id },
      { $set: { weddingId: scope.wedding._id, role: 'manager' } },
    );
    await User.updateOne(
      { _id: manager._id },
      { $set: { weddingId: null, role: null } },
    );
    await expect(
      organizerInvitation(manager._id.toString(), f.guest.id),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('keeps exact headcounts, independent function responses and stale-write protection', async () => {
    const scope = await wedding(),
      f = await issuedFixture(scope),
      other = await issuedFixture(scope);
    const hub = await guestHub(f.token),
      row = hub.invitations[0];
    const body = {
      invitationId: row.id,
      status: 'attending',
      additionalGuests: Number.MAX_SAFE_INTEGER,
    };
    const saved = await saveRsvp(f.token, hub.context, body, row.version);
    expect(saved.headcount).toBe('9007199254740992');
    expect(
      (await saveRsvp(f.token, hub.context, body, row.version)).version,
    ).toBe(saved.version);
    await expect(
      saveRsvp(
        f.token,
        hub.context,
        { ...body, additionalGuests: 1 },
        row.version,
      ),
    ).rejects.toMatchObject({ status: 412 });
    const second = await writeGuest(
      scope.adminId,
      scope.weddingId,
      {
        displayName: 'Second family',
        email: 'second@example.test',
        selectedEventIds: [f.event.id],
      },
      { key: randomUUID() },
    );
    await changeInvitation(
      scope.adminId,
      scope.weddingId,
      second.id,
      'issue',
      { guestVersion: second.version },
      randomUUID(),
    );
    const shared = await shareInvitation(
        scope.adminId,
        scope.weddingId,
        second.id,
      ),
      secondSession = await exchangeInvitation(
        Object.fromEntries(
          new URLSearchParams(new URL(shared.link).hash.slice(1)),
        ),
      );
    const secondHub = await guestHub(secondSession.token),
      secondRow = secondHub.invitations[0];
    await saveRsvp(
      secondSession.token,
      secondHub.context,
      { invitationId: secondRow.id, status: 'attending', additionalGuests: 1 },
      secondRow.version,
    );
    expect(
      (await attendanceOverview(scope.weddingId)).find(
        (e) => e.eventId === f.event.id,
      ),
    ).toMatchObject({
      attending: 2,
      pending: 0,
      headcount: '9007199254740994',
    });
    expect((await guestHub(other.token)).invitations[0].status).toBe('pending');
    const declined = await saveRsvp(
      f.token,
      hub.context,
      { invitationId: row.id, status: 'declined', additionalGuests: 0 },
      saved.version,
    );
    expect(declined.headcount).toBe('0');
    expect(
      (await attendanceOverview(scope.weddingId)).find(
        (e) => e.eventId === f.event.id,
      ),
    ).toMatchObject({ attending: 1, declined: 1, headcount: '2' });
  });
  it('checks cutoff, expiry and active lifecycle independently of public publishing', async () => {
    const scope = await wedding(),
      f = await issuedFixture(scope),
      hub = await guestHub(f.token),
      row = hub.invitations[0];
    expect(scope.wedding.isPublished).toBe(false);
    expect(hub.invitations).toHaveLength(1);
    await writeEvent(
      scope.adminId,
      scope.weddingId,
      {
        title: f.event.title,
        description: f.event.description,
        startsAt: new Date(Date.now() - 1000).toISOString(),
        endsAt: f.event.endsAt,
        timezone: f.event.timezone,
        venue: f.event.venue,
      },
      f.event.id,
      f.event.version,
    );
    await expect(
      saveRsvp(
        f.token,
        hub.context,
        { invitationId: row.id, status: 'attending', additionalGuests: 0 },
        row.version,
      ),
    ).rejects.toMatchObject({ code: 'RSVP_CLOSED' });
    expect((await guestHub(f.token)).invitations[0].closed).toBe(true);
    await mongoose.connection
      .collection('guestInvitationLinks')
      .updateOne(
        { _id: new Types.ObjectId(f.issued.link!.id) },
        { $set: { expiresAt: new Date(Date.now() - 1000) } },
      );
    await expect(guestHub(f.token)).rejects.toMatchObject({ status: 401 });
    expect(await attendanceOverview(scope.weddingId)).toEqual([]);
    const another = await issuedFixture(scope);
    await Wedding.updateOne(
      { _id: scope.wedding._id },
      { $set: { status: 'archived' } },
    );
    await expect(guestHub(another.token)).rejects.toMatchObject({
      status: 401,
    });
  });
  it('serializes revocation against RSVP and cancels queued mail without calling the provider', async () => {
    const scope = await wedding(),
      f = await issuedFixture(scope),
      hub = await guestHub(f.token),
      row = hub.invitations[0];
    const queued = await changeInvitation(
      scope.adminId,
      scope.weddingId,
      f.guest.id,
      'send',
      undefined,
      randomUUID(),
      f.issued.link!.version,
    );
    const results = await Promise.allSettled([
      saveRsvp(
        f.token,
        hub.context,
        { invitationId: row.id, status: 'attending', additionalGuests: 2 },
        row.version,
      ),
      changeInvitation(
        scope.adminId,
        scope.weddingId,
        f.guest.id,
        'revoke',
        undefined,
        undefined,
        f.issued.link!.version,
      ),
    ]);
    expect(results[1].status).toBe('fulfilled');
    if (results[0].status === 'rejected')
      expect(results[0].reason).toMatchObject({ status: 401 });
    await expect(guestHub(f.token)).rejects.toMatchObject({ status: 401 });
    const send = vi.fn();
    expect(
      (
        await dispatchGuestEmails(
          guestEmailEligible,
          { id: queued.deliveryId },
          send,
        )
      ).cancelled,
    ).toBe(1);
    expect(send).not.toHaveBeenCalled();
    expect(await attendanceOverview(scope.weddingId)).toEqual([]);
  });
  it('expires and closes guest sessions without affecting another session or organizer membership', async () => {
    const scope = await wedding(),
      f = await issuedFixture(scope),
      second = await exchangeInvitation(f.capability);
    const sessionRecord = await mongoose.connection
      .collection('guestInvitationSessions')
      .findOne({ tokenHash: hashSecret(f.token) });
    expect(sessionRecord!.expiresAt.getTime()).toBeLessThanOrEqual(
      Date.now() + 7 * 86400000,
    );
    expect(sessionRecord!.expiresAt.getTime()).toBeLessThanOrEqual(
      Date.parse(f.issued.link!.expiresAt),
    );
    await endGuestSession(f.token);
    await expect(guestHub(f.token)).rejects.toMatchObject({ status: 401 });
    expect((await guestHub(second.token)).guestName).toBe(f.guest.displayName);
    await mongoose.connection
      .collection('guestInvitationSessions')
      .updateOne(
        { tokenHash: hashSecret(second.token) },
        { $set: { expiresAt: new Date(Date.now() - 1) } },
      );
    await expect(guestHub(second.token)).rejects.toMatchObject({ status: 401 });
    expect(
      (await User.findById(scope.admin._id).lean())!.weddingId!.toString(),
    ).toBe(scope.weddingId);
  });
});
afterAll(async () => {
  try {
    if (
      mongoose.connection.readyState === 1 &&
      mongoose.connection.name === database &&
      /^sp_mem_test_[a-f0-9]{24}$/.test(database)
    )
      await mongoose.connection.dropDatabase();
  } finally {
    await mongoose.disconnect();
  }
});
async function user(email = `member-${++sequence}@example.test`) {
  return User.create({
    emailNormalized: email,
    displayName: 'Test organizer',
    passwordHash: await hashPassword(password),
    status: 'active',
    weddingId: null,
    role: null,
  });
}
async function wedding() {
  const admin = await user();
  const record = await Wedding.create({
    displayNames: { partnerOne: 'Aarav', partnerTwo: 'Ananya' },
    weddingDate: '2027-03-14',
    defaultLocation: { name: 'Jaipur' },
    timezone: 'Asia/Kolkata',
    slug: `test-${++sequence}`,
    createdBy: admin._id,
    status: 'active',
  });
  await User.updateOne(
    { _id: admin._id },
    { $set: { weddingId: record._id, role: 'admin' } },
  );
  return {
    admin,
    wedding: record,
    adminId: admin._id.toString(),
    weddingId: record._id.toString(),
  };
}
async function queued(
  scope: Awaited<ReturnType<typeof wedding>>,
  recipient: Awaited<ReturnType<typeof user>>,
  key = randomUUID(),
) {
  const result = await createInvitation(
    scope.adminId,
    { email: recipient.emailNormalized },
    key,
    scope.weddingId,
  );
  const record = await MemberInvite.findById(result.invitation.id)
    .select('+tokenHash')
    .lean();
  const batch = await EmailBatch.findById(record!.deliveryId)
    .select('+encrypted')
    .lean();
  const payload = decryptEmail(batch!.encrypted!, batch!._id.toString());
  const link = JSON.parse(payload)[0].text.match(/http[^\s]+/)[0];
  const token = new URLSearchParams(new URL(link).hash.slice(1)).get('token')!;
  return { ...result, record: record!, token, payload, link, key };
}
async function cookie(userId: Types.ObjectId) {
  const token = newSecret();
  const now = new Date();
  await Session.create({
    userId,
    tokenHash: hashSecret(token),
    createdAt: now,
    lastSeenAt: now,
    expiresAt: new Date(Date.now() + 3600000),
    absoluteExpiresAt: new Date(Date.now() + 3600000),
    revokedAt: null,
  });
  return `${cookieNames().session}=${token}`;
}
type Handler = (request: Request, context: unknown) => Promise<Response>;
async function call(
  handler: Handler,
  options: {
    cookie?: string;
    body?: unknown;
    csrf?: string;
    origin?: string;
    headers?: Record<string, string>;
    method?: string;
  } = {},
) {
  context.cookie = options.cookie ?? '';
  return handler(
    new Request('http://localhost:3000/api/v1/member-invites/context', {
      method: options.method ?? 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: context.cookie,
        ...(options.origin === 'omit'
          ? {}
          : { Origin: options.origin ?? 'http://localhost:3000' }),
        ...(options.csrf ? { 'X-CSRF-Token': options.csrf } : {}),
        ...options.headers,
      },
      ...(options.body !== undefined
        ? { body: JSON.stringify(options.body) }
        : {}),
    }),
    undefined,
  );
}
async function bootstrap(authCookie = '') {
  const response = await call(sessionHandler, {
    cookie: authCookie,
    method: 'GET',
  });
  const data = (await response.json()).data;
  const csrfCookie = response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  return {
    cookie: [authCookie, csrfCookie].filter(Boolean).join('; '),
    csrf: data.csrfToken,
  };
}
async function joinedManager(scope: Awaited<ReturnType<typeof wedding>>) {
  const account = await user();
  const invite = await queued(scope, account);
  await acceptInvitation(
    account._id.toString(),
    invite.token,
    invite.invitation.id,
  );
  const member = (await members(scope.adminId)).members.find(
    (row) => row.id === account._id.toString(),
  )!;
  return { account, invite, member };
}
function removeHttp(targetId: string, options: Parameters<typeof call>[1]) {
  return call(
    (request) =>
      removeManagerHandler(request, {
        params: Promise.resolve({ userId: targetId }),
      }),
    { ...options, method: 'DELETE' },
  );
}
describe('Functions', () => {
  const input = {
    title: 'Sangeet',
    description: 'Celebration',
    startsAt: '2027-03-13T14:00:00Z',
    endsAt: '2027-03-13T20:00:00Z',
    timezone: 'Asia/Kolkata',
    venue: { name: 'Grand ballroom', address: 'Jaipur' },
  };
  it('isolates tenants, supports Manager edits and rejects stale versions', async () => {
    const a = await wedding(),
      b = await wedding();
    const manager = await user();
    await User.updateOne(
      { _id: manager._id },
      { $set: { weddingId: a.wedding._id, role: 'manager' } },
    );
    const row = await writeEvent(
      a.adminId,
      a.weddingId,
      input,
      undefined,
      undefined,
      false,
      randomUUID(),
    );
    expect((await listEvents(b.adminId)).events).toHaveLength(0);
    await expect(readEvent(b.adminId, row.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      writeEvent(
        a.adminId,
        b.weddingId,
        input,
        undefined,
        undefined,
        false,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 409 });
    const edited = await writeEvent(
      manager._id.toString(),
      a.weddingId,
      { ...input, title: 'Edited' },
      row.id,
      0,
    );
    expect(edited.version).toBe(1);
    await expect(
      writeEvent(a.adminId, a.weddingId, input, row.id, 0),
    ).rejects.toMatchObject({ status: 412 });
  });
  it('blocks linked removal and archives only an unlinked function', async () => {
    const a = await wedding();
    const row = await writeEvent(
      a.adminId,
      a.weddingId,
      input,
      undefined,
      undefined,
      false,
      randomUUID(),
    );
    const task = await mongoose.connection.collection('tasks').insertOne({
      weddingId: a.wedding._id,
      eventId: new Types.ObjectId(row.id),
    });
    await expect(
      writeEvent(a.adminId, a.weddingId, undefined, row.id, 0, true),
    ).rejects.toMatchObject({ code: 'FUNCTION_HAS_LINKS' });
    await mongoose.connection
      .collection('tasks')
      .deleteOne({ _id: task.insertedId });
    await writeEvent(a.adminId, a.weddingId, undefined, row.id, 0, true);
    expect((await listEvents(a.adminId)).events).toHaveLength(0);
    await expect(readEvent(a.adminId, row.id)).rejects.toMatchObject({
      status: 404,
    });
  });
});
describe('Tasks and durable planning creates', () => {
  const eventInput = {
    title: 'Task function',
    startsAt: '2027-03-13T14:00:00Z',
    endsAt: '2027-03-13T20:00:00Z',
    timezone: 'Asia/Kolkata',
    venue: { name: 'Test hall' },
  };
  it('serializes identical function creates and rejects changed-payload key reuse', async () => {
    const a = await wedding(),
      key = randomUUID();
    const results = await Promise.all(
      [1, 2].map(() =>
        writeEvent(
          a.adminId,
          a.weddingId,
          eventInput,
          undefined,
          undefined,
          false,
          key,
        ),
      ),
    );
    expect(results[0].id).toBe(results[1].id);
    expect((await listEvents(a.adminId)).events).toHaveLength(1);
    await expect(
      writeEvent(
        a.adminId,
        a.weddingId,
        { ...eventInput, title: 'Changed' },
        undefined,
        undefined,
        false,
        key,
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await writeEvent(a.adminId, a.weddingId, undefined, results[0].id, 0, true);
    await expect(
      writeEvent(
        a.adminId,
        a.weddingId,
        eventInput,
        undefined,
        undefined,
        false,
        key,
      ),
    ).rejects.toMatchObject({ code: 'FUNCTION_ARCHIVED' });
  });
  it('allows a Manager to assign an Admin, complete tasks and update real summaries', async () => {
    const a = await wedding(),
      { account } = await joinedManager(a);
    const row = await writeTask(
      account.id,
      a.weddingId,
      {
        title: 'Venue call',
        assignedToUserId: a.adminId,
        dueAt: '2020-01-01T00:00:00Z',
      },
      { key: randomUUID() },
    );
    expect(row.assignee).toEqual({
      state: 'active',
      name: a.admin.displayName,
    });
    expect(row.overdue).toBe(true);
    expect((await taskOverview(a.weddingId, a.adminId)).summary).toMatchObject({
      total: 1,
      overdue: 1,
      assigned: 1,
      done: 0,
    });
    const done = await writeTask(
      a.adminId,
      a.weddingId,
      { status: 'done' },
      { id: row.id, version: 0 },
    );
    expect(done.overdue).toBe(false);
    expect((await taskOverview(a.weddingId, a.adminId)).summary).toMatchObject({
      total: 1,
      overdue: 0,
      assigned: 0,
      done: 1,
    });
    expect(
      (await taskOptions(account.id)).members.some((m) => m.id === a.adminId),
    ).toBe(true);
  });
  it('rejects foreign references, stale wedding context, stale edits and removed actors', async () => {
    const a = await wedding(),
      b = await wedding();
    const event = await writeEvent(
      b.adminId,
      b.weddingId,
      eventInput,
      undefined,
      undefined,
      false,
      randomUUID(),
    );
    for (const input of [
      { title: 'Foreign organizer', assignedToUserId: b.adminId },
      { title: 'Foreign event', eventId: event.id },
    ])
      await expect(
        writeTask(a.adminId, a.weddingId, input, { key: randomUUID() }),
      ).rejects.toMatchObject({ status: 404 });
    await expect(
      writeTask(
        a.adminId,
        b.weddingId,
        { title: 'Wrong context' },
        { key: randomUUID() },
      ),
    ).rejects.toMatchObject({ status: 409 });
    const row = await writeTask(
      a.adminId,
      a.weddingId,
      { title: 'Local' },
      { key: randomUUID() },
    );
    await expect(readTask(b.adminId, row.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      writeTask(
        b.adminId,
        b.weddingId,
        { title: 'Attack' },
        { id: row.id, version: 0 },
      ),
    ).rejects.toMatchObject({ status: 404 });
    await writeTask(
      a.adminId,
      a.weddingId,
      { status: 'inProgress' },
      { id: row.id, version: 0 },
    );
    await expect(
      writeTask(
        a.adminId,
        a.weddingId,
        { title: 'Stale' },
        { id: row.id, version: 0 },
      ),
    ).rejects.toMatchObject({ status: 412 });
    expect((await listTasks(b.adminId, {})).tasks).toHaveLength(0);
  });
  it('retains former assignments without resolving a profile in another wedding', async () => {
    const a = await wedding(),
      b = await wedding(),
      { account, member } = await joinedManager(a);
    const row = await writeTask(
      a.adminId,
      a.weddingId,
      { title: 'Assigned task', assignedToUserId: account.id },
      { key: randomUUID() },
    );
    const receiptKey = randomUUID();
    const original = {
      title: 'Retry after removal',
      assignedToUserId: account.id,
    };
    const receipt = await writeTask(a.adminId, a.weddingId, original, {
      key: receiptKey,
    });
    await removeManager(
      a.adminId,
      member.id,
      a.weddingId,
      member.membershipVersion,
    );
    await User.updateOne(
      { _id: account._id },
      {
        $set: {
          weddingId: b.wedding._id,
          role: 'manager',
          displayName: 'Private foreign profile',
        },
      },
    );
    expect((await readTask(a.adminId, row.id)).task.assignee).toEqual({
      state: 'former',
      name: null,
    });
    expect(
      (await writeTask(a.adminId, a.weddingId, original, { key: receiptKey }))
        .assignee,
    ).toEqual({ state: 'former', name: null });
    await expect(
      writeTask(
        a.adminId,
        a.weddingId,
        { title: 'New', assignedToUserId: account.id },
        { key: randomUUID() },
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      (
        await writeTask(
          a.adminId,
          a.weddingId,
          { status: 'done' },
          { id: row.id, version: 0 },
        )
      ).assignee.state,
    ).toBe('former');
    expect(
      (
        await writeTask(
          a.adminId,
          a.weddingId,
          { assignedToUserId: null },
          { id: row.id, version: 1 },
        )
      ).assignee.state,
    ).toBe('unassigned');
    expect(receipt.id).toBeDefined();
  });
  it('deduplicates concurrent creates, rejects key reuse and never recreates archived tasks', async () => {
    const a = await wedding(),
      key = randomUUID(),
      input = { title: 'Once' };
    const [first, second] = await Promise.all(
      [1, 2].map(() => writeTask(a.adminId, a.weddingId, input, { key })),
    );
    expect(first.id).toBe(second.id);
    expect((await listTasks(a.adminId, {})).summary.total).toBe(1);
    await expect(
      writeTask(a.adminId, a.weddingId, { title: 'Changed' }, { key }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await writeTask(
      a.adminId,
      a.weddingId,
      { status: 'done' },
      { id: first.id, version: 0 },
    );
    expect((await listTasks(a.adminId, {})).summary.unassigned).toBe(0);
    expect(
      (await writeTask(a.adminId, a.weddingId, input, { key })).status,
    ).toBe('done');
    await writeTask(a.adminId, a.weddingId, undefined, {
      id: first.id,
      version: 1,
      archive: true,
    });
    await expect(
      writeTask(a.adminId, a.weddingId, input, { key }),
    ).rejects.toMatchObject({ code: 'TASK_ARCHIVED' });
    expect((await listTasks(a.adminId, {})).summary.total).toBe(0);
  });
  it('pages stable filters without duplicates and binds cursors to those filters', async () => {
    const a = await wedding();
    for (let n = 0; n < 4; n++)
      await writeTask(
        a.adminId,
        a.weddingId,
        {
          title: 'Page ' + n,
          status: n === 0 ? 'done' : 'todo',
          dueAt: n === 1 ? '2020-01-01T00:00:00Z' : null,
        },
        { key: randomUUID() },
      );
    const first = await listTasks(a.adminId, { status: 'todo', limit: 2 });
    const second = await listTasks(a.adminId, {
      status: 'todo',
      limit: 2,
      cursor: first.nextCursor,
    });
    expect(
      new Set([...first.tasks, ...second.tasks].map((t) => t.id)).size,
    ).toBe(3);
    expect(second.nextCursor).toBe(null);
    await expect(
      listTasks(a.adminId, {
        status: 'done',
        limit: 2,
        cursor: first.nextCursor,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(
      (await listTasks(a.adminId, { overdue: 'true' })).tasks,
    ).toHaveLength(1);
    expect(
      (
        await listTasks(a.adminId, {
          assignedToUserId: 'unassigned',
          dueBefore: '2021-01-01T00:00:00Z',
        })
      ).tasks,
    ).toHaveLength(1);
  });
  it('serializes function archival against task reference creation', async () => {
    const a = await wedding();
    const event = await writeEvent(
      a.adminId,
      a.weddingId,
      eventInput,
      undefined,
      undefined,
      false,
      randomUUID(),
    );
    const results = await Promise.allSettled([
      writeTask(
        a.adminId,
        a.weddingId,
        { title: 'Linked', eventId: event.id },
        { key: randomUUID() },
      ),
      writeEvent(a.adminId, a.weddingId, undefined, event.id, 0, true),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const tasks = await listTasks(a.adminId, {});
    if (tasks.tasks.length) {
      expect((await listEvents(a.adminId)).events).toHaveLength(1);
      expect(results[1]).toMatchObject({
        status: 'rejected',
        reason: { code: 'FUNCTION_HAS_LINKS' },
      });
    } else
      expect(results[0]).toMatchObject({
        status: 'rejected',
        reason: { status: 404 },
      });
  });
  it('serializes Manager removal against assignment and denies later writes', async () => {
    const a = await wedding(),
      { account, member } = await joinedManager(a);
    const results = await Promise.allSettled([
      writeTask(
        a.adminId,
        a.weddingId,
        { title: 'Race assignment', assignedToUserId: account.id },
        { key: randomUUID() },
      ),
      removeManager(
        a.adminId,
        member.id,
        a.weddingId,
        member.membershipVersion,
      ),
    ]);
    expect(results[1].status).toBe('fulfilled');
    const tasks = await listTasks(a.adminId, {});
    if (tasks.tasks.length)
      expect(tasks.tasks[0].assignee).toEqual({ state: 'former', name: null });
    else
      expect(results[0]).toMatchObject({
        status: 'rejected',
        reason: { status: 404 },
      });
    await expect(
      writeTask(
        account.id,
        a.weddingId,
        { title: 'Removed writer' },
        { key: randomUUID() },
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe('Guest contacts and planned function selections', () => {
  const guest = {
    displayName: 'Family [A]',
    email: 'family@example.test',
    phone: '+91 90000 00000',
    notes: 'Private organizer note',
  };
  const eventInput = {
    title: 'Guest function',
    startsAt: '2027-03-13T14:00:00Z',
    endsAt: '2027-03-13T20:00:00Z',
    timezone: 'Asia/Kolkata',
    venue: { name: 'Test hall' },
  };
  it('supports both roles, separate shared-email contacts and truthful dashboard counts', async () => {
    const a = await wedding(),
      { account } = await joinedManager(a);
    const first = await writeGuest(
      account.id,
      a.weddingId,
      { ...guest, email: ' FAMILY@example.test ' },
      { key: randomUUID() },
    );
    expect(first.duplicateEmail).toBe(false);
    const second = await writeGuest(
      a.adminId,
      a.weddingId,
      { ...guest, displayName: 'Other family lead' },
      { key: randomUUID() },
    );
    expect(second.id).not.toBe(first.id);
    expect(second.duplicateEmail).toBe(true);
    expect((await readGuest(account.id, first.id)).guest.duplicateEmail).toBe(
      true,
    );
    expect((await workspaceCounts(a.weddingId)).guests).toBe(2);
    await writeGuest(account.id, a.weddingId, undefined, {
      id: first.id,
      version: 0,
      archive: true,
    });
    expect((await workspaceCounts(a.weddingId)).guests).toBe(1);
    expect((await readGuest(a.adminId, second.id)).guest.duplicateEmail).toBe(
      false,
    );
    expect(
      await mongoose.connection
        .collection('eventInvitations')
        .countDocuments({ weddingId: a.wedding._id }),
    ).toBe(0);
  });
  it('denies foreign reads/writes/references, stale context and removed actors', async () => {
    const a = await wedding(),
      b = await wedding(),
      { account, member } = await joinedManager(a);
    const event = await writeEvent(
      b.adminId,
      b.weddingId,
      eventInput,
      undefined,
      undefined,
      false,
      randomUUID(),
    );
    await expect(
      writeGuest(
        a.adminId,
        a.weddingId,
        { ...guest, selectedEventIds: [event.id] },
        { key: randomUUID() },
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      writeGuest(a.adminId, b.weddingId, guest, { key: randomUUID() }),
    ).rejects.toMatchObject({ code: 'WEDDING_CONTEXT_CHANGED' });
    const row = await writeGuest(a.adminId, a.weddingId, guest, {
      key: randomUUID(),
    });
    expect((await listGuests(b.adminId, {})).guests).toHaveLength(0);
    await expect(readGuest(b.adminId, row.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      writeGuest(
        b.adminId,
        b.weddingId,
        { notes: 'Attack' },
        { id: row.id, version: 0 },
      ),
    ).rejects.toMatchObject({ status: 404 });
    await removeManager(
      a.adminId,
      member.id,
      a.weddingId,
      member.membershipVersion,
    );
    await expect(
      writeGuest(account.id, a.weddingId, guest, { key: randomUUID() }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('deduplicates concurrent create retries, rejects payload reuse and archives safely', async () => {
    const a = await wedding(),
      key = randomUUID();
    const [one, two] = await Promise.all(
      [1, 2].map(() => writeGuest(a.adminId, a.weddingId, guest, { key })),
    );
    expect(one.id).toBe(two.id);
    expect((await listGuests(a.adminId, {})).summary.total).toBe(1);
    await expect(
      writeGuest(
        a.adminId,
        a.weddingId,
        { ...guest, displayName: 'Changed' },
        { key },
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await writeGuest(
      a.adminId,
      a.weddingId,
      { notes: 'Latest' },
      { id: one.id, version: 0 },
    );
    expect(
      (await writeGuest(a.adminId, a.weddingId, guest, { key })).notes,
    ).toBe('Latest');
    await expect(
      writeGuest(
        a.adminId,
        a.weddingId,
        { notes: 'Stale' },
        { id: one.id, version: 0 },
      ),
    ).rejects.toMatchObject({ status: 412 });
    await writeGuest(a.adminId, a.weddingId, undefined, {
      id: one.id,
      version: 1,
      archive: true,
    });
    await expect(readGuest(a.adminId, one.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      writeGuest(a.adminId, a.weddingId, guest, { key }),
    ).rejects.toMatchObject({ code: 'GUEST_ARCHIVED' });
  });
  it('searches literal text, filters functions and binds paging cursors to tenant and filters', async () => {
    const a = await wedding(),
      b = await wedding();
    const event = await writeEvent(
      a.adminId,
      a.weddingId,
      eventInput,
      undefined,
      undefined,
      false,
      randomUUID(),
    );
    for (let n = 0; n < 3; n++)
      await writeGuest(
        a.adminId,
        a.weddingId,
        {
          ...guest,
          displayName: 'Family [A] ' + n,
          selectedEventIds: [event.id],
        },
        { key: randomUUID() },
      );
    await writeGuest(
      a.adminId,
      a.weddingId,
      { ...guest, displayName: 'Different name', email: 'other@example.test' },
      { key: randomUUID() },
    );
    const first = await listGuests(a.adminId, {
      search: '[A]',
      eventId: event.id,
      limit: 2,
    });
    expect(first.guests).toHaveLength(2);
    const second = await listGuests(a.adminId, {
      search: '[A]',
      eventId: event.id,
      limit: 2,
      cursor: first.nextCursor,
    });
    expect(
      new Set([...first.guests, ...second.guests].map((g) => g.id)).size,
    ).toBe(3);
    await expect(
      listGuests(b.adminId, {
        search: '[A]',
        eventId: event.id,
        limit: 2,
        cursor: first.nextCursor,
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      listGuests(a.adminId, {
        search: 'other',
        limit: 2,
        cursor: first.nextCursor,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect((await listGuests(a.adminId, { search: '.*' })).guests).toHaveLength(
      0,
    );
  });
  it('serializes planned selections against function archival without creating invitations', async () => {
    const a = await wedding(),
      event = await writeEvent(
        a.adminId,
        a.weddingId,
        eventInput,
        undefined,
        undefined,
        false,
        randomUUID(),
      );
    const results = await Promise.allSettled([
      writeGuest(
        a.adminId,
        a.weddingId,
        { ...guest, selectedEventIds: [event.id] },
        { key: randomUUID() },
      ),
      writeEvent(a.adminId, a.weddingId, undefined, event.id, 0, true),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const page = await listGuests(a.adminId, {});
    if (page.guests.length) {
      expect(results[1]).toMatchObject({
        status: 'rejected',
        reason: { code: 'FUNCTION_HAS_LINKS' },
      });
      expect(page.guests[0].selectedEvents[0].id).toBe(event.id);
    } else
      expect(results[0]).toMatchObject({
        status: 'rejected',
        reason: { status: 404 },
      });
  });
  it('blocks unsafe changes when private-access records already reference a contact', async () => {
    const a = await wedding(),
      row = await writeGuest(a.adminId, a.weddingId, guest, {
        key: randomUUID(),
      });
    await mongoose.connection.collection('galleryTokens').insertOne({
      weddingId: a.wedding._id,
      guestContactId: new Types.ObjectId(row.id),
    });
    await expect(
      writeGuest(
        a.adminId,
        a.weddingId,
        { email: 'new@example.test' },
        { id: row.id, version: 0 },
      ),
    ).rejects.toMatchObject({ code: 'GUEST_HAS_ACCESS' });
    await expect(
      writeGuest(a.adminId, a.weddingId, undefined, {
        id: row.id,
        version: 0,
        archive: true,
      }),
    ).rejects.toMatchObject({ code: 'GUEST_HAS_ACCESS' });
    expect(
      (
        await writeGuest(
          a.adminId,
          a.weddingId,
          { notes: 'Safe note edit' },
          { id: row.id, version: 0 },
        )
      ).notes,
    ).toBe('Safe note edit');
  });
});

describe('Manager removal', () => {
  it('detaches only this membership, invalidates all sessions and invitations, and retains the account and planning records', async () => {
    const scope = await wedding();
    const { account, invite, member } = await joinedManager(scope);
    const cookies = [await cookie(account._id), await cookie(account._id)];
    const adminCookie = await cookie(scope.admin._id);
    const pendingToken = newSecret();
    await MemberInvite.create({
      ...invite.record,
      _id: new Types.ObjectId(),
      tokenHash: hashSecret(pendingToken),
      deliveryId: new Types.ObjectId(),
    });
    const before = await User.findById(account._id)
      .select('+passwordHash')
      .lean();
    const task = await mongoose.connection.collection('tasks').insertOne({
      weddingId: scope.wedding._id,
      assigneeId: account._id,
      title: 'Existing planning record',
    });
    expect(
      await removeManager(
        scope.adminId,
        member.id,
        scope.weddingId,
        member.membershipVersion,
      ),
    ).toEqual({ removed: true });
    const after = await User.findById(account._id)
      .select('+passwordHash')
      .lean();
    expect(after).toMatchObject({
      weddingId: null,
      role: null,
      status: 'active',
      passwordHash: before!.passwordHash,
      membershipVersion: member.membershipVersion + 1,
    });
    expect(
      await Session.countDocuments({ userId: account._id, revokedAt: null }),
    ).toBe(0);
    for (const authCookie of cookies) {
      expect(await findSession(authCookie.split('=')[1])).toBeNull();
      expect(
        (await call(membersHandler, { cookie: authCookie, method: 'GET' }))
          .status,
      ).toBe(401);
    }
    expect(await findSession(adminCookie.split('=')[1])).not.toBeNull();
    expect(await invitationView(pendingToken, member.id)).toEqual({
      state: 'invalid',
    });
    expect(await invitationView(invite.token, member.id)).toEqual({
      state: 'invalid',
    });
    await expect(
      acceptInvitation(member.id, invite.token, invite.invitation.id),
    ).rejects.toMatchObject({ code: 'INVALID_INVITATION' });
    expect(
      await invitationEmailEligible(
        scope.adminId,
        hashSecret(invite.token),
        new Date(),
        scope.weddingId,
      ),
    ).toBe(false);
    expect(
      await mongoose.connection
        .collection('tasks')
        .countDocuments({ _id: task.insertedId, weddingId: scope.wedding._id }),
    ).toBe(1);
    const anon = await bootstrap();
    const login = await call(authHandler('login'), {
      ...anon,
      body: { email: account.emailNormalized, password },
    });
    expect(login.status).toBe(200);
    expect((await login.json()).data.user).toMatchObject({
      weddingId: null,
      role: null,
    });
  });
  it('rejects Managers, self/Admin removal, foreign members and stale wedding context', async () => {
    const scope = await wedding();
    const other = await wedding();
    const { member } = await joinedManager(scope);
    await expect(
      removeManager(member.id, scope.adminId, scope.weddingId, 0),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      removeManager(scope.adminId, scope.adminId, scope.weddingId, 0),
    ).rejects.toMatchObject({ status: 403 });
    const secondAdmin = await user();
    await User.updateOne(
      { _id: secondAdmin._id },
      { $set: { weddingId: scope.wedding._id, role: 'admin' } },
    );
    await expect(
      removeManager(
        scope.adminId,
        secondAdmin._id.toString(),
        scope.weddingId,
        0,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      removeManager(
        other.adminId,
        member.id,
        other.weddingId,
        member.membershipVersion,
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      removeManager(
        scope.adminId,
        member.id,
        other.weddingId,
        member.membershipVersion,
      ),
    ).rejects.toMatchObject({ code: 'WEDDING_CONTEXT_CHANGED' });
    expect(
      (await members(scope.adminId)).members.map((row) => row.id),
    ).toContain(member.id);
  });
  it('requires a new invitation to rejoin and rejects removal from an older membership generation', async () => {
    const scope = await wedding();
    const { account, member } = await joinedManager(scope);
    await removeManager(
      scope.adminId,
      member.id,
      scope.weddingId,
      member.membershipVersion,
    );
    const fresh = await queued(scope, account);
    await acceptInvitation(member.id, fresh.token, fresh.invitation.id);
    const current = (await members(scope.adminId)).members.find(
      (row) => row.id === member.id,
    )!;
    expect(current.membershipVersion).toBe(member.membershipVersion + 2);
    const newCookie = await cookie(account._id);
    await expect(
      removeManager(
        scope.adminId,
        member.id,
        scope.weddingId,
        member.membershipVersion,
      ),
    ).rejects.toMatchObject({ status: 412 });
    expect(await findSession(newCookie.split('=')[1])).not.toBeNull();
    expect(
      (await User.findById(account._id).lean())!.weddingId?.toString(),
    ).toBe(scope.weddingId);
  });
  it('serializes concurrent deletes and prevents old acceptance from restoring removed access', async () => {
    const scope = await wedding();
    const { account, member, invite } = await joinedManager(scope);
    const results = await Promise.allSettled([
      removeManager(
        scope.adminId,
        member.id,
        scope.weddingId,
        member.membershipVersion,
      ),
      removeManager(
        scope.adminId,
        member.id,
        scope.weddingId,
        member.membershipVersion,
      ),
      acceptInvitation(member.id, invite.token, invite.invitation.id),
    ]);
    expect(
      results.slice(0, 2).filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect((await User.findById(account._id).lean())!.weddingId).toBeNull();
    expect(await invitationView(invite.token, member.id)).toEqual({
      state: 'invalid',
    });
  });
  it('rolls back detachment and session revocation if invitation invalidation fails', async () => {
    const scope = await wedding();
    const { account, member, invite } = await joinedManager(scope);
    const authCookie = await cookie(account._id);
    const spy = vi
      .spyOn(inviteRepository, 'invalidateMemberInvitations')
      .mockRejectedValueOnce(new Error('Synthetic failure'));
    try {
      await expect(
        removeManager(
          scope.adminId,
          member.id,
          scope.weddingId,
          member.membershipVersion,
        ),
      ).rejects.toBeDefined();
    } finally {
      spy.mockRestore();
    }
    expect(
      (await User.findById(account._id).lean())!.weddingId?.toString(),
    ).toBe(scope.weddingId);
    expect(await findSession(authCookie.split('=')[1])).not.toBeNull();
    expect((await invitationView(invite.token, member.id)).state).toBe(
      'already-member',
    );
  });
  it('handles legacy missing version and does not invalidate another weddings invitations', async () => {
    const scope = await wedding();
    const other = await wedding();
    const account = await user();
    const otherInvite = await queued(other, account);
    await User.updateOne(
      { _id: account._id },
      {
        $set: { weddingId: scope.wedding._id, role: 'manager' },
        $unset: { membershipVersion: 1 },
      },
    );
    const dto = (await members(scope.adminId)).members.find(
      (row) => row.id === account._id.toString(),
    )!;
    expect(dto.membershipVersion).toBe(0);
    await removeManager(scope.adminId, dto.id, scope.weddingId, 0);
    expect((await invitationView(otherInvite.token, dto.id)).state).toBe(
      'eligible',
    );
  });
  it('enforces HTTP authentication, Origin, CSRF, membership preconditions and no-body contract', async () => {
    const scope = await wedding();
    const { account, member } = await joinedManager(scope);
    const admin = await bootstrap(await cookie(scope.admin._id));
    const headers = {
      'X-Wedding-Context': scope.weddingId,
      'If-Match': `"${member.membershipVersion}"`,
    };
    expect(
      (await removeHttp(member.id, { ...admin, headers, origin: 'omit' }))
        .status,
    ).toBe(403);
    expect(
      (await removeHttp(member.id, { cookie: admin.cookie, headers })).status,
    ).toBe(403);
    expect(
      (
        await removeHttp(member.id, {
          ...admin,
          headers: { 'X-Wedding-Context': scope.weddingId },
        })
      ).status,
    ).toBe(428);
    expect(
      (
        await removeHttp(member.id, {
          ...admin,
          headers: { ...headers, 'If-Match': 'W/"1"' },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await removeHttp(member.id, {
          ...admin,
          headers,
          body: { role: 'admin' },
        })
      ).status,
    ).toBe(400);
    const manager = await bootstrap(await cookie(account._id));
    expect((await removeHttp(member.id, { ...manager, headers })).status).toBe(
      403,
    );
    expect(
      (
        await removeHttp(member.id, {
          ...admin,
          headers: { ...headers, 'If-Match': '"0"' },
        })
      ).status,
    ).toBe(412);
    const response = await removeHttp(member.id, { ...admin, headers });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect((await removeHttp(member.id, { ...admin, headers })).status).toBe(
      404,
    );
  });
});

describe('Manager invitation transactions', () => {
  it('paginates organizer and invitation lists without crossing the wedding boundary', async () => {
    const scope = await wedding();
    const other = await wedding();
    const now = new Date();
    await User.insertMany(
      Array.from({ length: 26 }, (_, index) => ({
        emailNormalized: `page-${++sequence}-${index}@example.test`,
        displayName: 'Page organizer',
        passwordHash: 'unused-test-only',
        weddingId: scope.wedding._id,
        role: 'manager',
        status: 'active',
      })),
    );
    await MemberInvite.insertMany(
      Array.from({ length: 26 }, (_, index) => ({
        weddingId: scope.wedding._id,
        emailNormalized: `invite-${++sequence}-${index}@example.test`,
        invitedRole: 'manager',
        invitedBy: scope.admin._id,
        tokenHash: hashSecret(newSecret()),
        state: 'pending',
        expiresAt: new Date(now.getTime() + 86400000),
        createdAt: now,
        deliveryId: new Types.ObjectId(),
      })),
    );
    const first = await members(scope.adminId);
    const second = await members(scope.adminId, first.nextCursor!);
    expect(first.members).toHaveLength(25);
    expect(second.members).toHaveLength(2);
    expect(
      new Set([...first.members, ...second.members].map((row) => row.id)).size,
    ).toBe(27);
    const invites = await invitations(scope.adminId);
    const rest = await invitations(scope.adminId, invites.nextCursor!);
    expect(invites.invitations).toHaveLength(25);
    expect(rest.invitations).toHaveLength(1);
    expect(
      new Set(
        [...invites.invitations, ...rest.invitations].map((row) => row.id),
      ).size,
    ).toBe(26);
    expect((await invitations(other.adminId)).invitations).toHaveLength(0);
  });
  it('retries mock invitations with exactly the same payload and provider key', async () => {
    const scope = await wedding();
    const invite = await queued(scope, await user());
    const send = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'retry', category: 'network' })
      .mockResolvedValueOnce({ kind: 'submitted', id: 'mock-retry' });
    const options = { id: invite.record.deliveryId.toString(), limit: 1 };
    expect(
      (await dispatchInvitationEmails(invitationEmailEligible, options, send))
        .retry,
    ).toBe(1);
    await EmailDelivery.updateOne(
      { _id: invite.record.deliveryId },
      { $set: { nextAttemptAt: new Date(0) } },
    );
    expect(
      (await dispatchInvitationEmails(invitationEmailEligible, options, send))
        .submitted,
    ).toBe(1);
    expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
  });
  it('stores hashes and encrypted email, exposes no secret, and reveals no public wedding or recipient', async () => {
    const scope = await wedding();
    const recipient = await user();
    const invite = await queued(scope, recipient);
    expect(invite.record.tokenHash).toBe(hashSecret(invite.token));
    expect(JSON.stringify(invite.invitation)).not.toContain(invite.token);
    expect(invite.link).toContain('/join#token=');
    const stored = await EmailBatch.findById(invite.record.deliveryId)
      .select('+encrypted')
      .lean();
    expect(JSON.stringify(stored)).not.toContain(invite.token);
    expect(JSON.stringify(stored)).not.toContain(recipient.emailNormalized);
    expect(await invitationView(invite.token)).toEqual({ state: 'signed-out' });
    expect(
      (await invitationView(invite.token, recipient._id.toString())).state,
    ).toBe('eligible');
    expect(
      (await invitationView(invite.token, (await user())._id.toString())).state,
    ).toBe('wrong-email');
  });
  it('deduplicates concurrent invitations, preserves receipts and rejects changed idempotent payload', async () => {
    const scope = await wedding();
    const recipient = await user();
    const key = randomUUID();
    const run = (requestKey: string) =>
      createInvitation(
        scope.adminId,
        { email: recipient.emailNormalized },
        requestKey,
        scope.weddingId,
      );
    const results = await Promise.all([run(key), run(randomUUID()), run(key)]);
    expect(new Set(results.map((result) => result.invitation.id)).size).toBe(1);
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(
      await MemberInvite.countDocuments({ weddingId: scope.wedding._id }),
    ).toBe(1);
    expect(
      await EmailDelivery.countDocuments({ weddingId: scope.wedding._id }),
    ).toBe(1);
    expect(
      await MemberInviteRequest.countDocuments({
        weddingId: scope.wedding._id,
      }),
    ).toBe(2);
    await expect(
      createInvitation(
        scope.adminId,
        { email: 'different@example.test' },
        key,
        scope.weddingId,
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
  it('enforces roles, strict inputs, trusted wedding context and tenant-scoped reads/revocation', async () => {
    const a = await wedding();
    const b = await wedding();
    const recipient = await user();
    const invite = await queued(a, recipient);
    await User.updateOne(
      { _id: recipient._id },
      { $set: { weddingId: a.wedding._id, role: 'manager' } },
    );
    const id = recipient._id.toString();
    await expect(invitations(id)).rejects.toMatchObject({ status: 403 });
    await expect(
      createInvitation(
        id,
        { email: 'new@example.test' },
        randomUUID(),
        a.weddingId,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      revokeInvitation(id, invite.invitation.id, a.weddingId),
    ).rejects.toMatchObject({ status: 403 });
    expect((await members(id)).members).toHaveLength(2);
    expect((await invitations(b.adminId)).invitations).toHaveLength(0);
    await expect(
      revokeInvitation(b.adminId, invite.invitation.id, b.weddingId),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      createInvitation(
        a.adminId,
        { email: 'new@example.test' },
        randomUUID(),
        b.weddingId,
      ),
    ).rejects.toMatchObject({ code: 'WEDDING_CONTEXT_CHANGED' });
    await expect(
      createInvitation(
        a.adminId,
        { email: 'new@example.test', invitedRole: 'admin' },
        randomUUID(),
        a.weddingId,
      ),
    ).rejects.toBeDefined();
    await expect(
      createInvitation(
        a.adminId,
        { email: 'new@example.test' },
        'invalid',
        a.weddingId,
      ),
    ).rejects.toBeDefined();
  });
  it('accepts exactly once as Manager and safely replays concurrent/lost-response retries', async () => {
    const scope = await wedding();
    const recipient = await user();
    const invite = await queued(scope, recipient);
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        acceptInvitation(
          recipient._id.toString(),
          invite.token,
          invite.invitation.id,
        ),
      ),
    );
    expect(results.filter((result) => !result.replayed)).toHaveLength(1);
    expect(await User.findById(recipient._id).lean()).toMatchObject({
      role: 'manager',
      weddingId: scope.wedding._id,
    });
    expect(
      await MemberInvite.findById(invite.invitation.id).lean(),
    ).toMatchObject({ state: 'accepted', consumedBy: recipient._id });
    expect(
      (await invitationView(invite.token, recipient._id.toString())).state,
    ).toBe('already-member');
    expect(
      await invitationEmailEligible(
        scope.adminId,
        hashSecret(invite.token),
        new Date(),
        scope.weddingId,
      ),
    ).toBe(false);
    await expect(
      revokeInvitation(scope.adminId, invite.invitation.id, scope.weddingId),
    ).rejects.toMatchObject({ code: 'INVITATION_ALREADY_ACCEPTED' });
  });
  it('never attaches a wrong email, another wedding, a disabled account or an invalid token', async () => {
    const scope = await wedding();
    const recipient = await user();
    const invite = await queued(scope, recipient);
    const other = await user();
    await expect(
      acceptInvitation(
        other._id.toString(),
        invite.token,
        invite.invitation.id,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      acceptInvitation(
        recipient._id.toString(),
        newSecret(),
        invite.invitation.id,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_INVITATION' });
    await expect(
      acceptInvitation(
        recipient._id.toString(),
        invite.token,
        new Types.ObjectId().toString(),
      ),
    ).rejects.toMatchObject({ code: 'INVITATION_CONTEXT_CHANGED' });
    const second = await wedding();
    await User.updateOne(
      { _id: recipient._id },
      { $set: { weddingId: second.wedding._id, role: 'manager' } },
    );
    expect(
      (await invitationView(invite.token, recipient._id.toString())).state,
    ).toBe('other-wedding');
    await expect(
      acceptInvitation(
        recipient._id.toString(),
        invite.token,
        invite.invitation.id,
      ),
    ).rejects.toMatchObject({ code: 'USER_ALREADY_IN_WEDDING' });
    await User.updateOne(
      { _id: recipient._id },
      { $set: { weddingId: null, role: null, status: 'disabled' } },
    );
    await expect(
      acceptInvitation(
        recipient._id.toString(),
        invite.token,
        invite.invitation.id,
      ),
    ).rejects.toMatchObject({ status: 401 });
    expect(
      (await MemberInvite.findById(invite.invitation.id).lean())!.state,
    ).toBe('pending');
  });
  it('allows only one wedding to win simultaneous acceptance', async () => {
    const a = await wedding();
    const b = await wedding();
    const recipient = await user();
    const ia = await queued(a, recipient);
    const ib = await queued(b, recipient);
    const results = await Promise.allSettled(
      [ia, ib].map((invite) =>
        acceptInvitation(
          recipient._id.toString(),
          invite.token,
          invite.invitation.id,
        ),
      ),
    );
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      await MemberInvite.countDocuments({
        _id: { $in: [ia.record._id, ib.record._id] },
        state: 'accepted',
      }),
    ).toBe(1);
  });
  it('serializes revoke versus accept and makes repeat revocation safe', async () => {
    const scope = await wedding();
    const recipient = await user();
    const invite = await queued(scope, recipient);
    const results = await Promise.allSettled([
      revokeInvitation(scope.adminId, invite.invitation.id, scope.weddingId),
      acceptInvitation(
        recipient._id.toString(),
        invite.token,
        invite.invitation.id,
      ),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const record = await MemberInvite.findById(invite.invitation.id).lean();
    expect(
      (await User.findById(recipient._id).lean())!.weddingId?.toString() ??
        null,
    ).toBe(record!.state === 'accepted' ? scope.weddingId : null);
    if (record!.state === 'revoked')
      expect(
        (
          await revokeInvitation(
            scope.adminId,
            invite.invitation.id,
            scope.weddingId,
          )
        ).state,
      ).toBe('revoked');
  });
  it('invalidates expiry, revocation, archived weddings and disabled inviters', async () => {
    for (const mode of [
      'expired',
      'revoked',
      'archived',
      'disabled',
    ] as const) {
      const scope = await wedding();
      const recipient = await user();
      const invite = await queued(scope, recipient);
      if (mode === 'expired')
        await MemberInvite.updateOne(
          { _id: invite.record._id },
          { $set: { expiresAt: new Date(0) } },
        );
      if (mode === 'revoked')
        await revokeInvitation(
          scope.adminId,
          invite.invitation.id,
          scope.weddingId,
        );
      if (mode === 'archived')
        await Wedding.updateOne(
          { _id: scope.wedding._id },
          { $set: { status: 'archived' } },
        );
      if (mode === 'disabled')
        await User.updateOne(
          { _id: scope.admin._id },
          { $set: { status: 'disabled' } },
        );
      expect(await invitationView(invite.token)).toEqual({ state: 'invalid' });
      await expect(
        acceptInvitation(
          recipient._id.toString(),
          invite.token,
          invite.invitation.id,
        ),
      ).rejects.toMatchObject({ code: 'INVALID_INVITATION' });
    }
  });
  it('rolls back a successful membership claim if invitation consumption fails', async () => {
    const scope = await wedding();
    const recipient = await user();
    const invite = await queued(scope, recipient);
    const spy = vi
      .spyOn(inviteRepository, 'consumeInvite')
      .mockRejectedValueOnce(new Error('Synthetic failure'));
    try {
      await expect(
        acceptInvitation(
          recipient._id.toString(),
          invite.token,
          invite.invitation.id,
        ),
      ).rejects.toBeDefined();
    } finally {
      spy.mockRestore();
    }
    expect((await User.findById(recipient._id).lean())!.weddingId).toBeNull();
    expect((await MemberInvite.findById(invite.record._id).lean())!.state).toBe(
      'pending',
    );
  });
  it('rolls back invitation and receipt if email configuration is absent', async () => {
    const scope = await wedding();
    const saved = process.env.RESEND_API_KEY;
    process.env.RESEND_API_KEY = '';
    try {
      await expect(
        createInvitation(
          scope.adminId,
          { email: 'missing@example.test' },
          randomUUID(),
          scope.weddingId,
        ),
      ).rejects.toMatchObject({ status: 503 });
    } finally {
      process.env.RESEND_API_KEY = saved;
    }
    expect(
      await MemberInvite.countDocuments({ weddingId: scope.wedding._id }),
    ).toBe(0);
    expect(
      await MemberInviteRequest.countDocuments({
        weddingId: scope.wedding._id,
      }),
    ).toBe(0);
  });
  it('reissues after expiry without reusing a private capability', async () => {
    const scope = await wedding();
    const recipient = await user();
    const old = await queued(scope, recipient);
    await MemberInvite.updateOne(
      { _id: old.record._id },
      { $set: { expiresAt: new Date(0) } },
    );
    const fresh = await queued(scope, recipient);
    expect(fresh.token).not.toBe(old.token);
    expect((await MemberInvite.findById(old.record._id).lean())!.state).toBe(
      'expired',
    );
    expect(
      await MemberInvite.countDocuments({
        weddingId: scope.wedding._id,
        state: 'pending',
      }),
    ).toBe(1);
  });
  it('submits immutable mock mail, scopes status and cancels revoked mail before submission', async () => {
    const scope = await wedding();
    const other = await wedding();
    const recipient = await user();
    const invite = await queued(scope, recipient);
    const send = vi.fn(async () => ({
      kind: 'submitted' as const,
      id: 'mock-message',
    }));
    expect(
      (
        await dispatchInvitationEmails(
          invitationEmailEligible,
          { id: invite.record.deliveryId.toString(), limit: 1 },
          send,
        )
      ).submitted,
    ).toBe(1);
    expect(send).toHaveBeenCalledWith(
      invite.payload,
      `member-invite/${invite.record.deliveryId}`,
    );
    expect((await invitations(scope.adminId)).invitations[0].delivery).toBe(
      'submitted',
    );
    expect((await invitations(other.adminId)).invitations).toHaveLength(0);
    const pending = await queued(scope, await user());
    await revokeInvitation(
      scope.adminId,
      pending.invitation.id,
      scope.weddingId,
    );
    expect(
      (
        await dispatchInvitationEmails(
          invitationEmailEligible,
          { id: pending.record.deliveryId.toString(), limit: 1 },
          send,
        )
      ).cancelled,
    ).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
describe('Invitation HTTP boundaries', () => {
  it('requires Origin and CSRF even when staging anonymous capabilities', async () => {
    const scope = await wedding();
    const invite = await queued(scope, await user());
    expect(
      (
        await call(stageInvitationHandler, {
          body: { token: invite.token },
          origin: 'omit',
        })
      ).status,
    ).toBe(403);
    expect(
      (await call(stageInvitationHandler, { body: { token: invite.token } }))
        .status,
    ).toBe(403);
    const anon = await bootstrap();
    const response = await call(stageInvitationHandler, {
      ...anon,
      body: { token: invite.token },
    });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ state: 'signed-out' });
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    const set = response.headers.getSetCookie().join(';');
    expect(set).toContain('HttpOnly');
    expect(set).toContain('SameSite=lax');
    expect(set).toContain('Max-Age=900');
    expect(invitationCookieOptions().secure).toBe(false);
    vi.stubEnv('NODE_ENV', 'production');
    expect(invitationCookieName()).toBe('__Host-shaadipilot_invitation');
    expect(invitationCookieOptions()).toMatchObject({
      secure: true,
      httpOnly: true,
      path: '/',
    });
    vi.stubEnv('NODE_ENV', 'test');
  });
  it('carries staged context through real login with a fixed allowlisted destination', async () => {
    const scope = await wedding();
    const recipient = await user();
    const invite = await queued(scope, recipient);
    const anon = await bootstrap();
    const staged = await call(stageInvitationHandler, {
      ...anon,
      body: { token: invite.token },
    });
    const pending = staged.headers.getSetCookie()[0].split(';')[0];
    const response = await call(authHandler('login'), {
      ...anon,
      cookie: anon.cookie + '; ' + pending,
      body: { email: recipient.emailNormalized, password },
    });
    expect(response.status).toBe(200);
    expect((await response.json()).data.redirectTo).toBe('/join');
    expect((await User.findById(recipient._id).lean())!.weddingId).toBeNull();
  });
  it('rejects cross-tab account or invitation changes before membership writes', async () => {
    const scope = await wedding();
    const recipient = await user();
    const invite = await queued(scope, recipient);
    const signed = await bootstrap(await cookie(recipient._id));
    const withInvite = {
      ...signed,
      cookie: signed.cookie + `; ${invitationCookieName()}=${invite.token}`,
    };
    const response = await call(acceptInvitationHandler, {
      ...withInvite,
      body: { invitationId: invite.invitation.id },
      headers: { 'X-Organizer-Context': new Types.ObjectId().toString() },
    });
    expect(response.status).toBe(409);
    expect(
      (
        await call(acceptInvitationHandler, {
          ...withInvite,
          body: { invitationId: new Types.ObjectId().toString() },
          headers: { 'X-Organizer-Context': recipient._id.toString() },
        })
      ).status,
    ).toBe(409);
    expect((await User.findById(recipient._id).lean())!.weddingId).toBeNull();
    const accepted = await call(acceptInvitationHandler, {
      ...withInvite,
      body: { invitationId: invite.invitation.id },
      headers: { 'X-Organizer-Context': recipient._id.toString() },
    });
    expect(accepted.status).toBe(200);
    expect(
      (
        await call(clearInvitationHandler, { ...withInvite, method: 'DELETE' })
      ).headers
        .getSetCookie()
        .join(';'),
    ).toContain('Max-Age=0');
  });
  it('enforces direct API authorization, strict query and required request guards', async () => {
    expect((await call(membersHandler, { method: 'GET' })).status).toBe(401);
    const scope = await wedding();
    const signed = await bootstrap(await cookie(scope.admin._id));
    const schedule = vi.fn();
    const handler = createInvitationHandler(schedule);
    expect(
      (
        await call(handler, {
          ...signed,
          body: { email: 'guard@example.test' },
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await call(handler, {
          ...signed,
          body: { email: 'guard@example.test' },
          headers: {
            'X-Wedding-Context': new Types.ObjectId().toString(),
            'Idempotency-Key': randomUUID(),
          },
        })
      ).status,
    ).toBe(409);
    expect(schedule).not.toHaveBeenCalled();
    const manager = await user();
    await User.updateOne(
      { _id: manager._id },
      { $set: { weddingId: scope.wedding._id, role: 'manager' } },
    );
    expect(
      (
        await call(invitationsHandler, {
          cookie: await cookie(manager._id),
          method: 'GET',
        })
      ).status,
    ).toBe(403);
  });
});

describe('Function roster and manual RSVP reminders', () => {
  it('queues one immutable reminder across matching retries and cancels it after a response', async () => {
    const scope = await wedding(),
      f = await issuedFixture(scope),
      key = randomUUID();
    const sent = await changeInvitation(
      scope.adminId,
      scope.weddingId,
      f.guest.id,
      'remind',
      undefined,
      key,
      f.issued.link!.version,
    );
    const replay = await changeInvitation(
      scope.adminId,
      scope.weddingId,
      f.guest.id,
      'remind',
      undefined,
      key,
      f.issued.link!.version,
    );
    expect(replay.deliveryId).toBe(sent.deliveryId);
    const jobs = await EmailDelivery.find({
      weddingId: scope.wedding._id,
      kind: 'guest-reminder',
    }).lean();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].reminderEventIds?.map((id) => id.toString())).toEqual([
      f.event.id,
    ]);
    const payload = await EmailBatch.findById(sent.deliveryId)
      .select('+encrypted')
      .lean();
    const mail = JSON.parse(
      decryptEmail(payload!.encrypted!, sent.deliveryId!),
    )[0];
    expect(mail.subject).toContain('RSVP reminder');
    const invitation = (await guestHub(f.token)).invitations[0];
    await saveRsvp(
      f.token,
      f.issued.link!.id,
      { invitationId: invitation.id, status: 'attending', additionalGuests: 2 },
      invitation.version,
    );
    const send = vi.fn(async () => ({
      kind: 'submitted' as const,
      id: 'mock-reminder',
    }));
    expect(
      (
        await dispatchGuestReminders(
          guestReminderEligible,
          { id: sent.deliveryId, limit: 1 },
          send,
        )
      ).cancelled,
    ).toBe(1);
    expect(send).not.toHaveBeenCalled();
    await expect(
      changeInvitation(
        scope.adminId,
        scope.weddingId,
        f.guest.id,
        'remind',
        undefined,
        randomUUID(),
        f.issued.link!.version,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('submits a pending reminder through the existing processor and rejects stale or foreign writers', async () => {
    const scope = await wedding(),
      other = await wedding(),
      f = await issuedFixture(scope);
    await expect(
      changeInvitation(
        other.adminId,
        other.weddingId,
        f.guest.id,
        'remind',
        undefined,
        randomUUID(),
        f.issued.link!.version,
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      changeInvitation(
        scope.adminId,
        scope.weddingId,
        f.guest.id,
        'remind',
        undefined,
        randomUUID(),
        f.issued.link!.version + 1,
      ),
    ).rejects.toMatchObject({ status: 412 });
    const queued = await changeInvitation(
      scope.adminId,
      scope.weddingId,
      f.guest.id,
      'remind',
      undefined,
      randomUUID(),
      f.issued.link!.version,
    );
    const send = vi.fn(async () => ({
      kind: 'submitted' as const,
      id: 'mock-reminder',
    }));
    expect(
      (
        await dispatchGuestReminders(
          guestReminderEligible,
          { id: queued.deliveryId, limit: 1 },
          send,
        )
      ).submitted,
    ).toBe(1);
    expect(
      (await organizerInvitation(scope.adminId, f.guest.id)).reminderDelivery,
    ).toBe('submitted');
    expect(
      (await organizerInvitation(scope.adminId, f.guest.id)).delivery,
    ).toBe('not-requested');
    const late = await changeInvitation(
      scope.adminId,
      scope.weddingId,
      f.guest.id,
      'remind',
      undefined,
      randomUUID(),
      f.issued.link!.version,
    );
    await changeInvitation(
      scope.adminId,
      scope.weddingId,
      f.guest.id,
      'revoke',
      undefined,
      undefined,
      f.issued.link!.version,
    );
    expect(
      (
        await dispatchGuestReminders(
          guestReminderEligible,
          { id: late.deliveryId, limit: 1 },
          send,
        )
      ).cancelled,
    ).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('returns only the requested tenant function with explicit inactive history and bound cursors', async () => {
    const scope = await wedding(),
      other = await wedding(),
      f = await issuedFixture(scope);
    const roster = await functionRoster(scope.adminId, f.event.id);
    expect(roster.rows).toHaveLength(1);
    expect(roster.rows[0]).toMatchObject({
      guestId: f.guest.id,
      status: 'pending',
      active: true,
      headcount: '0',
    });
    expect(JSON.stringify(roster)).not.toContain('secret');
    await expect(
      functionRoster(other.adminId, f.event.id),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      functionRoster(
        scope.adminId,
        f.event.id,
        other.weddingId + ':' + f.event.id + ':' + new Types.ObjectId(),
      ),
    ).rejects.toMatchObject({ status: 400 });
    await changeInvitation(
      scope.adminId,
      scope.weddingId,
      f.guest.id,
      'revoke',
      undefined,
      undefined,
      f.issued.link!.version,
    );
    expect(
      (await functionRoster(scope.adminId, f.event.id)).rows[0].active,
    ).toBe(false);
  });
});

function fakePhotos() {
  const objects = new Map<string, Buffer>();
  const storage: PhotoStorage = {
    configured: () => true,
    uploadUrl: vi.fn(async (key) => 'https://storage.example.test/' + key),
    read: vi.fn(async (key) => {
      const data = objects.get(key);
      if (!data) throw new Error('mock unavailable');
      return data;
    }),
    put: vi.fn(async (key, bytes) => {
      objects.set(key, Buffer.from(bytes));
    }),
    remove: vi.fn(async (key) => {
      objects.delete(key);
    }),
    viewUrl: vi.fn(
      async (key) => 'https://storage.example.test/' + key + '?temporary=true',
    ),
  };
  return { objects, storage };
}
async function stagedPhoto(
  scope: Awaited<ReturnType<typeof wedding>>,
  fake: ReturnType<typeof fakePhotos>,
  bytes: Buffer,
  key = randomUUID(),
) {
  const result = await createUpload(
    scope.adminId,
    scope.weddingId,
    {
      fileName: 'Private photo.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: bytes.length,
    },
    key,
    fake.storage,
  );
  const record = await mongoose.connection
    .collection('photos')
    .findOne({ _id: new Types.ObjectId(result.photo.id) });
  fake.objects.set(record!.stagingKey, bytes);
  return { ...result, key, record: record! };
}
describe('Organizer private gallery with mocked R2', () => {
  it('uses durable upload receipts, strips metadata, commits immutable final keys and never lists signed credentials', async () => {
    const scope = await wedding(),
      fake = fakePhotos();
    const bytes = await sharp({
      create: { width: 8, height: 6, channels: 3, background: 'pink' },
    })
      .jpeg()
      .withMetadata()
      .toBuffer();
    const intent = await stagedPhoto(scope, fake, bytes);
    const replay = await createUpload(
      scope.adminId,
      scope.weddingId,
      {
        fileName: 'Private photo.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: bytes.length,
      },
      intent.key,
      fake.storage,
    );
    expect(replay.photo.id).toBe(intent.photo.id);
    await expect(
      createUpload(
        scope.adminId,
        scope.weddingId,
        {
          fileName: 'Different.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: bytes.length,
        },
        intent.key,
        fake.storage,
      ),
    ).rejects.toMatchObject({ status: 409 });
    const result = await completeUpload(
      scope.adminId,
      scope.weddingId,
      intent.photo.id,
      fake.storage,
    );
    expect(result.photo.state).toBe('ready');
    const row = await mongoose.connection
      .collection('photos')
      .findOne({ _id: new Types.ObjectId(intent.photo.id) });
    expect(row!.objectKey).not.toBe(row!.stagingKey);
    const cleaned = fake.objects.get(row!.objectKey)!;
    expect((await sharp(cleaned).metadata()).exif).toBeUndefined();
    fake.objects.set(row!.stagingKey, Buffer.from('late invalid replacement'));
    expect(
      (
        await completeUpload(
          scope.adminId,
          scope.weddingId,
          intent.photo.id,
          fake.storage,
        )
      ).photo.state,
    ).toBe('ready');
    expect(fake.objects.get(row!.objectKey)).toEqual(cleaned);
    const list = await listPhotos(scope.adminId, {}, fake.storage);
    expect(list.photos).toHaveLength(1);
    expect(list.usage.bytes).toBe(cleaned.length);
    expect(JSON.stringify(list)).not.toContain('objectKey');
    expect(JSON.stringify(list)).not.toContain('uploadUrl');
    expect(
      (await photoView(scope.adminId, intent.photo.id, fake.storage)).url,
    ).toContain('temporary=true');
    await mongoose.connection
      .collection('photos')
      .updateOne({ _id: row!._id }, { $set: { cleanupAfter: new Date(0) } });
    await cleanupPhotos(fake.storage);
    expect(fake.objects.has(row!.stagingKey)).toBe(false);
    expect(fake.objects.has(row!.objectKey)).toBe(true);
  });
  it('isolates photos, rejects foreign functions and stops a removed organizer at completion', async () => {
    const scope = await wedding(),
      other = await wedding(),
      fake = fakePhotos();
    const bytes = await sharp({
      create: { width: 2, height: 2, channels: 3, background: 'red' },
    })
      .jpeg()
      .toBuffer();
    const intent = await stagedPhoto(scope, fake, bytes);
    await expect(
      completeUpload(
        other.adminId,
        other.weddingId,
        intent.photo.id,
        fake.storage,
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      photoView(other.adminId, intent.photo.id, fake.storage),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      createUpload(
        scope.adminId,
        scope.weddingId,
        {
          fileName: 'x.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 10,
          eventId: new Types.ObjectId().toString(),
        },
        randomUUID(),
        fake.storage,
      ),
    ).rejects.toMatchObject({ status: 404 });
    fake.storage.put = vi.fn(async (key, bytes) => {
      fake.objects.set(key, bytes);
      await User.updateOne(
        { _id: scope.admin._id },
        {
          $set: { weddingId: null, role: null },
          $inc: { membershipVersion: 1 },
        },
      );
    });
    await expect(
      completeUpload(
        scope.adminId,
        scope.weddingId,
        intent.photo.id,
        fake.storage,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      (await mongoose.connection
        .collection('photos')
        .findOne({ _id: new Types.ObjectId(intent.photo.id) }))!.state,
    ).not.toBe('ready');
  });
  it('serializes quota reservation and retains durable reservations until cleanup succeeds', async () => {
    const scope = await wedding(),
      fake = fakePhotos();
    vi.stubEnv('GALLERY_MAX_PHOTOS', '1');
    try {
      const input = {
        fileName: 'x.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 100,
      };
      const results = await Promise.allSettled([
        createUpload(
          scope.adminId,
          scope.weddingId,
          input,
          randomUUID(),
          fake.storage,
        ),
        createUpload(
          scope.adminId,
          scope.weddingId,
          input,
          randomUUID(),
          fake.storage,
        ),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(
        (results.find((r) => r.status === 'rejected') as PromiseRejectedResult)
          .reason,
      ).toMatchObject({ code: 'GALLERY_FULL' });
      const page = await listPhotos(scope.adminId, {}, fake.storage);
      expect(page.usage.bytes).toBe(MAX_PHOTO_BYTES);
      const row = page.photos[0];
      await removePhoto(scope.adminId, scope.weddingId, row.id, row.version);
      expect(
        (await listPhotos(scope.adminId, {}, fake.storage)).usage.count,
      ).toBe(1);
      await mongoose.connection
        .collection('photos')
        .updateOne(
          { _id: new Types.ObjectId(row.id) },
          { $set: { cleanupAfter: new Date(0) } },
        );
      fake.storage.remove = vi.fn(async () => {
        throw new Error('mock retry');
      });
      await cleanupPhotos(fake.storage);
      expect(
        (await listPhotos(scope.adminId, {}, fake.storage)).usage.count,
      ).toBe(1);
      fake.storage.remove = vi.fn(async (key) => {
        fake.objects.delete(key);
      });
      await mongoose.connection
        .collection('photos')
        .updateOne(
          { _id: new Types.ObjectId(row.id) },
          { $set: { cleanupAfter: new Date(0) } },
        );
      await cleanupPhotos(fake.storage);
      expect(
        (await listPhotos(scope.adminId, {}, fake.storage)).usage.count,
      ).toBe(0);
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it('preserves recoverable provider failures and rejects invalid bytes before publishing', async () => {
    const scope = await wedding(),
      fake = fakePhotos();
    const bytes = await sharp({
      create: { width: 2, height: 2, channels: 3, background: 'blue' },
    })
      .jpeg()
      .toBuffer();
    const intent = await stagedPhoto(scope, fake, bytes);
    const put = fake.storage.put;
    fake.storage.put = vi.fn(async () => {
      throw new Error('mock timeout');
    });
    await expect(
      completeUpload(
        scope.adminId,
        scope.weddingId,
        intent.photo.id,
        fake.storage,
      ),
    ).rejects.toThrow();
    expect(
      (await listPhotos(scope.adminId, {}, fake.storage)).photos[0].state,
    ).toBe('pending');
    fake.storage.put = put;
    await completeUpload(
      scope.adminId,
      scope.weddingId,
      intent.photo.id,
      fake.storage,
    );
    const ready = (await listPhotos(scope.adminId, {}, fake.storage)).photos[0];
    await expect(
      removePhoto(scope.adminId, scope.weddingId, ready.id, ready.version - 1),
    ).rejects.toMatchObject({ status: 412 });
    await removePhoto(scope.adminId, scope.weddingId, ready.id, ready.version);
    await expect(
      photoView(scope.adminId, ready.id, fake.storage),
    ).rejects.toMatchObject({ status: 404 });
    const invalid = await stagedPhoto(
      scope,
      fake,
      Buffer.from('invalid image bytes'),
    );
    await expect(
      completeUpload(
        scope.adminId,
        scope.weddingId,
        invalid.photo.id,
        fake.storage,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_PHOTO' });
    expect(
      (await listPhotos(scope.adminId, {}, fake.storage)).photos.find(
        (p) => p.id === invalid.photo.id,
      )!.state,
    ).toBe('rejected');
  });
  it('rejects expired uploads, changed tenant contexts and mismatched pagination', async () => {
    const scope = await wedding(),
      fake = fakePhotos();
    const intent = await stagedPhoto(
      scope,
      fake,
      Buffer.from('not actually uploaded'),
    );
    await mongoose.connection
      .collection('photos')
      .updateOne(
        { _id: new Types.ObjectId(intent.photo.id) },
        { $set: { expiresAt: new Date(0) } },
      );
    await expect(
      completeUpload(
        scope.adminId,
        scope.weddingId,
        intent.photo.id,
        fake.storage,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      listPhotos(
        scope.adminId,
        { cursor: new Types.ObjectId() + ':' + intent.photo.id },
        fake.storage,
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      createUpload(
        scope.adminId,
        new Types.ObjectId().toString(),
        { fileName: 'x.jpg', mimeType: 'image/jpeg', sizeBytes: 10 },
        randomUUID(),
        fake.storage,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe('Manual saved vendor directory', () => {
  const input = {
    name: 'Studio [A]',
    category: 'Photography',
    phone: '+91 90000 00000',
    email: 'STUDIO@example.test',
    website: 'https://example.test',
    address: 'Jaipur',
    notes: 'Private team note',
  };
  it('deduplicates concurrent creates, rejects changed retries and preserves expenses on archive', async () => {
    const scope = await wedding(),
      key = randomUUID();
    const [one, two] = await Promise.all([
      writeVendor(scope.adminId, scope.weddingId, input, { key }),
      writeVendor(scope.adminId, scope.weddingId, input, { key }),
    ]);
    expect(one.vendor.id).toBe(two.vendor.id);
    expect(one.vendor).toMatchObject({
      email: 'studio@example.test',
      source: 'manual',
      version: 0,
    });
    await expect(
      writeVendor(
        scope.adminId,
        scope.weddingId,
        { ...input, name: 'Changed' },
        { key },
      ),
    ).rejects.toMatchObject({ status: 409 });
    const expense = await writeExpense(
      scope.adminId,
      scope.weddingId,
      {
        title: 'Independent expense',
        amountMinor: '15000',
        paidAt: '2027-03-01',
      },
      { key: randomUUID() },
    );
    // Existing references must survive vendor removal, even before the expense
    // UI supports adding vendor references in a later increment.
    await mongoose.connection
      .collection('expenses')
      .updateOne(
        { _id: new Types.ObjectId(expense.expense.id) },
        { $set: { vendorId: new Types.ObjectId(one.vendor.id) } },
      );
    await writeVendor(scope.adminId, scope.weddingId, undefined, {
      id: one.vendor.id,
      version: 0,
      archive: true,
    });
    expect((await listVendors(scope.adminId)).total).toBe(0);
    expect(
      (await readExpense(scope.adminId, expense.expense.id)).expense
        .amountMinor,
    ).toBe('15000');
    await expect(
      readVendor(scope.adminId, one.vendor.id),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      writeVendor(scope.adminId, scope.weddingId, input, { key }),
    ).rejects.toMatchObject({ code: 'VENDOR_ARCHIVED' });
    const archived = await mongoose.connection
      .collection('vendors')
      .findOne({ _id: new Types.ObjectId(one.vendor.id) });
    expect(archived!.archivedAt).toBeInstanceOf(Date);
    expect(archived!.updatedBy.toString()).toBe(scope.adminId);
  });
  it('enforces tenants, current membership, wedding state and stale concurrent edits', async () => {
    const scope = await wedding(),
      other = await wedding(),
      manager = await user();
    await User.updateOne(
      { _id: manager._id },
      { $set: { weddingId: scope.wedding._id, role: 'manager' } },
    );
    const { vendor } = await writeVendor(
      manager._id.toString(),
      scope.weddingId,
      input,
      { key: randomUUID() },
    );
    expect((await weddingOverview(scope.adminId))!.vendorCount).toBe(1);
    expect((await listVendors(other.adminId)).vendors).toEqual([]);
    await expect(readVendor(other.adminId, vendor.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      writeVendor(
        other.adminId,
        other.weddingId,
        { name: 'Foreign' },
        { id: vendor.id, version: 0 },
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      writeVendor(scope.adminId, other.weddingId, input, { key: randomUUID() }),
    ).rejects.toMatchObject({ status: 409 });
    const updates = await Promise.allSettled(
      ['One', 'Two'].map((name) =>
        writeVendor(
          scope.adminId,
          scope.weddingId,
          { name },
          { id: vendor.id, version: 0 },
        ),
      ),
    );
    expect(updates.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(updates.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { status: 412 },
    });
    await User.updateOne(
      { _id: manager._id },
      { $set: { weddingId: null, role: null } },
    );
    await expect(
      writeVendor(manager._id.toString(), scope.weddingId, input, {
        key: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 403 });
    await Wedding.updateOne(
      { _id: scope.wedding._id },
      { $set: { status: 'archived' } },
    );
    await expect(
      writeVendor(scope.adminId, scope.weddingId, input, { key: randomUUID() }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('uses literal search and filter-bound pagination with complete filtered counts', async () => {
    const scope = await wedding();
    for (let i = 0; i < 27; i++)
      await writeVendor(
        scope.adminId,
        scope.weddingId,
        { ...input, name: 'Studio [A] ' + i },
        { key: randomUUID() },
      );
    await writeVendor(
      scope.adminId,
      scope.weddingId,
      { name: 'Different', category: 'Catering' },
      { key: randomUUID() },
    );
    const first = await listVendors(scope.adminId, {
      search: '[A]',
      category: 'Photography',
    });
    expect(first.total).toBe(27);
    expect(first.vendors).toHaveLength(25);
    const second = await listVendors(scope.adminId, {
      search: '[A]',
      category: 'Photography',
      cursor: first.nextCursor,
    });
    expect(second.vendors).toHaveLength(2);
    expect(second.nextCursor).toBeNull();
    expect(
      new Set([...first.vendors, ...second.vendors].map((v) => v.id)).size,
    ).toBe(27);
    expect(
      (await listVendors(scope.adminId, { search: '.*' })).vendors,
    ).toHaveLength(0);
    await expect(
      listVendors(scope.adminId, {
        category: 'Catering',
        cursor: first.nextCursor,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('Exact shared wedding expense ledger', () => {
  const input = {
    title: 'Paid venue',
    amountMinor: '9007199254740993',
    paidAt: '2027-03-01',
    currency: 'INR',
    category: 'Venue',
    notes: 'Deposit',
  };
  it('creates once on retry, edits with versions, removes from totals and retains provenance', async () => {
    const scope = await wedding(),
      key = randomUUID();
    const result = await writeExpense(scope.adminId, scope.weddingId, input, {
      key,
    });
    const replay = await writeExpense(scope.adminId, scope.weddingId, input, {
      key,
    });
    expect(replay.expense.id).toBe(result.expense.id);
    await expect(
      writeExpense(
        scope.adminId,
        scope.weddingId,
        { ...input, title: 'changed' },
        { key },
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect((await expenseSummary(scope.adminId)).summary.amountMinor).toBe(
      input.amountMinor,
    );
    expect(
      (await weddingOverview(scope.adminId))!.expenseSummary.amountMinor,
    ).toBe(input.amountMinor);
    const edited = await writeExpense(
      scope.adminId,
      scope.weddingId,
      { amountMinor: '29', paidAt: '2027-03-02' },
      { id: result.expense.id, version: 0 },
    );
    expect(edited.expense.version).toBe(1);
    await expect(
      writeExpense(
        scope.adminId,
        scope.weddingId,
        { title: 'stale' },
        { id: result.expense.id, version: 0 },
      ),
    ).rejects.toMatchObject({ status: 412 });
    await writeExpense(scope.adminId, scope.weddingId, undefined, {
      id: result.expense.id,
      version: 1,
      archive: true,
    });
    expect((await expenseSummary(scope.adminId)).summary.amountMinor).toBe('0');
    await expect(
      readExpense(scope.adminId, result.expense.id),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      writeExpense(scope.adminId, scope.weddingId, input, { key }),
    ).rejects.toMatchObject({ status: 409 });
    const stored = await mongoose.connection
      .collection('expenses')
      .findOne({ _id: new Types.ObjectId(result.expense.id) });
    expect(stored!.archivedAt).toBeInstanceOf(Date);
    expect(stored!.updatedBy.toString()).toBe(scope.adminId);
  });
  it('enforces tenant and function references, permits Managers and sums above safe integer range', async () => {
    const scope = await wedding(),
      other = await wedding(),
      manager = await user();
    await User.updateOne(
      { _id: manager._id },
      { $set: { weddingId: scope.wedding._id, role: 'manager' } },
    );
    const row = await writeExpense(scope.adminId, scope.weddingId, input, {
      key: randomUUID(),
    });
    await writeExpense(
      manager._id.toString(),
      scope.weddingId,
      { ...input, amountMinor: '10' },
      { key: randomUUID() },
    );
    expect((await expenseSummary(scope.adminId)).summary.amountMinor).toBe(
      '9007199254741003',
    );
    await expect(
      readExpense(other.adminId, row.expense.id),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      writeExpense(
        other.adminId,
        other.weddingId,
        { title: 'foreign' },
        { id: row.expense.id, version: 0 },
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      writeExpense(
        scope.adminId,
        scope.weddingId,
        { ...input, eventId: new Types.ObjectId().toString() },
        { key: randomUUID() },
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      writeExpense(scope.adminId, other.weddingId, input, {
        key: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await listExpenses(other.adminId, {})).expenses).toHaveLength(0);
  });
  it('keeps filtered totals separate and serializes concurrent edits', async () => {
    const scope = await wedding();
    const row = await writeExpense(
      scope.adminId,
      scope.weddingId,
      { ...input, amountMinor: '123' },
      { key: randomUUID() },
    );
    await writeExpense(
      scope.adminId,
      scope.weddingId,
      { ...input, category: 'Food', amountMinor: '456', paidAt: '2027-04-01' },
      { key: randomUUID() },
    );
    const page = await listExpenses(scope.adminId, {
      category: 'Venue',
      from: '2027-03-01',
      to: '2027-03-31',
    });
    expect(page.expenses).toHaveLength(1);
    expect(page.summary.amountMinor).toBe('123');
    await expect(
      listExpenses(scope.adminId, { cursor: 'wrong:' + row.expense.id }),
    ).rejects.toMatchObject({ status: 400 });
    const results = await Promise.allSettled([
      writeExpense(
        scope.adminId,
        scope.weddingId,
        { amountMinor: '10' },
        { id: row.expense.id, version: 0 },
      ),
      writeExpense(
        scope.adminId,
        scope.weddingId,
        { amountMinor: '20' },
        { id: row.expense.id, version: 0 },
      ),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
});
