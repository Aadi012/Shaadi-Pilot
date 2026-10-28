import 'server-only';
import { Types } from 'mongoose';
import { ApiError } from '@/lib/api/errors';
import { ConfigurationError } from '@/lib/config/env.server';
import {
  loadOrganizerMembership,
  attachInvitedOrganizer,
  weddingOrganizers,
  weddingOrganizerExists,
  weddingOrganizer,
  detachManager,
} from '@/modules/auth/service.server';
import {
  hashSecret,
  isSecret,
  newSecret,
} from '@/modules/auth/security.server';
import {
  activeWeddingForMembership,
  lockWeddingMembership,
} from '@/modules/weddings/service.server';
import {
  prepareEmailQueue,
  queueManagerInvitation,
  invitationMailStates,
} from '@/modules/email/service.server';
import {
  inviteSchema,
  inviteKeySchema,
  objectIdSchema,
  type InviteDto,
  type JoinView,
} from './contracts';
import {
  membershipDatabase,
  findInvite,
  findInviteByHash,
  findInviteRequest,
  insertInviteRequest,
  findPendingInvite,
  expirePendingInvites,
  insertInvite,
  listInvites,
  consumeInvite,
  revokeInvite,
  invalidateMemberInvitations,
} from './repository.server';
import type { InviteRecord } from './models.server';
import type { ClientSession } from 'mongoose';
const forbidden = () =>
  new ApiError({
    status: 403,
    code: 'FORBIDDEN',
    message: 'Team administration is available to wedding Admins only.',
  });
const invalid = () =>
  new ApiError({
    status: 400,
    code: 'INVALID_INVITATION',
    message:
      'This invitation is invalid or no longer available. Contact the inviting Admin.',
  });
async function organizer(
  userId: string,
  admin = false,
  expectedWedding?: string,
  session?: ClientSession,
) {
  const user = await loadOrganizerMembership(userId, session);
  if (!user)
    throw new ApiError({
      status: 401,
      code: 'UNAUTHENTICATED',
      message: 'Please log in.',
    });
  if (
    !user.weddingId ||
    !['admin', 'manager'].includes(user.role ?? '') ||
    (admin && user.role !== 'admin')
  )
    throw forbidden();
  if (
    expectedWedding !== undefined &&
    user.weddingId.toString() !== expectedWedding
  )
    throw new ApiError({
      status: 409,
      code: 'WEDDING_CONTEXT_CHANGED',
      message:
        'Your signed-in wedding changed. Reload this workspace before continuing.',
    });
  return user;
}
function inviteDto(
  invite: InviteRecord,
  delivery: InviteDto['delivery'] = 'unavailable',
): InviteDto {
  return {
    id: invite._id.toString(),
    email: invite.emailNormalized,
    role: 'manager',
    state:
      invite.state === 'pending' && invite.expiresAt <= new Date()
        ? 'expired'
        : invite.state,
    expiresAt: invite.expiresAt.toISOString(),
    createdAt: invite.createdAt.toISOString(),
    delivery,
  };
}
async function activeMemberWedding(id: Types.ObjectId) {
  if (!(await activeWeddingForMembership(id)))
    throw new ApiError({
      status: 404,
      code: 'NOT_FOUND',
      message: 'Wedding not found.',
    });
}
export async function members(userId: string, cursor?: string) {
  await membershipDatabase();
  const user = await organizer(userId);
  await activeMemberWedding(user.weddingId!);
  const rows = await weddingOrganizers(
    user.weddingId!,
    cursor ? new Types.ObjectId(objectIdSchema.parse(cursor)) : undefined,
  );
  const page = rows.slice(0, 25);
  return {
    weddingId: user.weddingId!.toString(),
    members: page.map((row) => ({
      id: row._id.toString(),
      name: row.displayName,
      role: row.role as 'admin' | 'manager',
      membershipVersion: row.membershipVersion ?? 0,
    })),
    nextCursor: rows.length > 25 ? page.at(-1)!._id.toString() : null,
  };
}
export async function removeManager(
  userId: string,
  targetId: string,
  expectedWedding: string,
  version: number,
) {
  const target = new Types.ObjectId(objectIdSchema.parse(targetId));
  objectIdSchema.parse(expectedWedding);
  if (!Number.isSafeInteger(version) || version < 0)
    throw new ApiError({
      status: 400,
      code: 'INVALID_PRECONDITION',
      message: 'Provide a valid membership version.',
    });
  const db = await membershipDatabase();
  return db.connection.transaction(async (session) => {
    const actor = await organizer(userId, true, expectedWedding, session);
    if (!(await lockWeddingMembership(actor.weddingId!, session)))
      throw new ApiError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'Wedding not found.',
      });
    const member = await weddingOrganizer(target, actor.weddingId!, session);
    if (!member)
      throw new ApiError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'Organizer not found in this wedding. Refresh the team list.',
      });
    if (member.role !== 'manager' || member._id.toString() === userId)
      throw new ApiError({
        status: 403,
        code: 'FORBIDDEN',
        message: 'Only Manager memberships can be removed here.',
      });
    if ((member.membershipVersion ?? 0) !== version)
      throw new ApiError({
        status: 412,
        code: 'PRECONDITION_FAILED',
        message:
          'This membership changed. Refresh and review it before removing.',
      });
    const now = new Date();
    if (
      (await detachManager(target, actor.weddingId!, version, now, session))
        .modifiedCount !== 1
    )
      throw new ApiError({
        status: 412,
        code: 'PRECONDITION_FAILED',
        message: 'This membership changed. Refresh the team list.',
      });
    await invalidateMemberInvitations(
      actor.weddingId!,
      member.emailNormalized,
      now,
      session,
    );
    return { removed: true };
  });
}

export async function invitations(userId: string, cursor?: string) {
  await membershipDatabase();
  const user = await organizer(userId, true);
  await activeMemberWedding(user.weddingId!);
  const rows = await listInvites(
    user.weddingId!,
    cursor ? new Types.ObjectId(objectIdSchema.parse(cursor)) : undefined,
  );
  const page = rows.slice(0, 25);
  const mail = await invitationMailStates(
    user.weddingId!,
    page.map((row) => row.deliveryId),
  );
  const states = new Map(mail.map((row) => [row._id.toString(), row.state]));
  return {
    weddingId: user.weddingId!.toString(),
    invitations: page.map((row) =>
      inviteDto(row, states.get(row.deliveryId.toString())),
    ),
    nextCursor: rows.length > 25 ? page.at(-1)!._id.toString() : null,
  };
}
export async function createInvitation(
  userId: string,
  input: unknown,
  key: unknown,
  expectedWedding: string,
) {
  const data = inviteSchema.parse(input);
  const requestKey = inviteKeySchema.parse(key);
  objectIdSchema.parse(expectedWedding);
  const db = await membershipDatabase();
  await prepareEmailQueue();
  const receiptId = hashSecret(`${userId}:${expectedWedding}:${requestKey}`);
  const requestHash = hashSecret(JSON.stringify(data));
  const token = newSecret();
  return db.connection.transaction(async (session) => {
    const now = new Date();
    const user = await organizer(userId, true, expectedWedding, session);
    const wedding = await lockWeddingMembership(user.weddingId!, session);
    if (!wedding)
      throw new ApiError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'Wedding not found.',
      });
    const receipt = await findInviteRequest(receiptId, session);
    if (receipt) {
      if (receipt.requestHash !== requestHash)
        throw new ApiError({
          status: 409,
          code: 'IDEMPOTENCY_CONFLICT',
          message:
            'This request key was used for different invitation details.',
        });
      const existing = await findInvite(
        receipt.invitationId,
        user.weddingId!,
        session,
      );
      if (!existing) throw invalid();
      return {
        invitation: inviteDto(existing),
        created: false,
        deliveryId: null,
      };
    }
    if (await weddingOrganizerExists(user.weddingId!, data.email, session))
      throw new ApiError({
        status: 409,
        code: 'ALREADY_MEMBER',
        message: 'This organizer is already part of your wedding.',
      });
    await expirePendingInvites(user.weddingId!, data.email, now, session);
    let invite: InviteRecord | null = await findPendingInvite(
      user.weddingId!,
      data.email,
      session,
    );
    let created = false;
    if (!invite) {
      const id = new Types.ObjectId();
      const deliveryId = new Types.ObjectId();
      invite = {
        _id: id,
        weddingId: user.weddingId!,
        emailNormalized: data.email,
        invitedRole: 'manager',
        invitedBy: user._id,
        tokenHash: hashSecret(token),
        state: 'pending',
        expiresAt: new Date(now.getTime() + 7 * 86400000),
        createdAt: now,
        consumedAt: null,
        consumedBy: null,
        revokedAt: null,
        deliveryId,
      };
      await insertInvite(invite, session);
      try {
        await queueManagerInvitation(
          {
            id: deliveryId,
            weddingId: user.weddingId!,
            inviterId: user._id,
            recipient: data.email,
            couple: `${wedding.displayNames.partnerOne} & ${wedding.displayNames.partnerTwo}`,
            token,
            expiresAt: invite.expiresAt,
          },
          session,
        );
      } catch (error) {
        if (error instanceof ConfigurationError)
          throw new ApiError({
            status: 503,
            code: 'SERVICE_UNAVAILABLE',
            message:
              'Invitation email is not configured. Your invitation was not queued.',
          });
        throw error;
      }
      created = true;
    }
    await insertInviteRequest(
      {
        _id: receiptId,
        weddingId: user.weddingId!,
        requestHash,
        invitationId: invite._id,
      },
      session,
    );
    return {
      invitation: inviteDto(invite, created ? 'pending' : 'unavailable'),
      created,
      deliveryId: created ? invite.deliveryId.toString() : null,
    };
  });
}
export async function revokeInvitation(
  userId: string,
  id: string,
  expectedWedding: string,
) {
  const inviteId = new Types.ObjectId(objectIdSchema.parse(id));
  objectIdSchema.parse(expectedWedding);
  const db = await membershipDatabase();
  return db.connection.transaction(async (session) => {
    const user = await organizer(userId, true, expectedWedding, session);
    if (!(await lockWeddingMembership(user.weddingId!, session)))
      throw invalid();
    const invite = await findInvite(inviteId, user.weddingId!, session);
    if (!invite)
      throw new ApiError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'Invitation not found.',
      });
    if (invite.state === 'accepted')
      throw new ApiError({
        status: 409,
        code: 'INVITATION_ALREADY_ACCEPTED',
        message: 'This invitation was accepted. Refresh the team list.',
      });
    if (invite.state !== 'pending') return inviteDto(invite);
    const updated = await revokeInvite(
      inviteId,
      user.weddingId!,
      new Date(),
      session,
    );
    if (!updated) throw invalid();
    return inviteDto(updated);
  });
}
async function usableInvitation(
  token: string | undefined,
  session?: ClientSession,
) {
  if (!isSecret(token)) return null;
  const invite = await findInviteByHash(hashSecret(token), session);
  if (
    !invite ||
    invite.invitedRole !== 'manager' ||
    !['pending', 'accepted'].includes(invite.state) ||
    invite.expiresAt <= new Date()
  )
    return null;
  const wedding = await activeWeddingForMembership(invite.weddingId, session);
  if (!wedding) return null;
  const inviter = await loadOrganizerMembership(
    invite.invitedBy.toString(),
    session,
  );
  if (
    !inviter ||
    inviter.role !== 'admin' ||
    inviter.weddingId?.toString() !== invite.weddingId.toString()
  )
    return null;
  return { invite, wedding };
}
export async function invitationView(
  token: string | undefined,
  userId?: string,
): Promise<JoinView> {
  await membershipDatabase();
  const usable = await usableInvitation(token);
  if (!usable) return { state: 'invalid' };
  if (!userId) return { state: 'signed-out' };
  const user = await loadOrganizerMembership(userId);
  if (!user) return { state: 'signed-out' };
  const identity = { id: user._id.toString(), email: user.emailNormalized };
  const { invite, wedding } = usable;
  if (user.emailNormalized !== invite.emailNormalized)
    return { state: 'wrong-email', user: identity };
  if (invite.state === 'accepted' && invite.consumedBy?.toString() !== userId)
    return { state: 'invalid' };
  const context = {
    id: invite._id.toString(),
    weddingId: invite.weddingId.toString(),
    couple: `${wedding.displayNames.partnerOne} & ${wedding.displayNames.partnerTwo}`,
    role: 'manager' as const,
    expiresAt: invite.expiresAt.toISOString(),
  };
  if (user.weddingId?.toString() === context.weddingId)
    return { state: 'already-member', user: identity, invitation: context };
  if (invite.state !== 'pending') return { state: 'invalid' };
  return {
    state: user.weddingId ? 'other-wedding' : 'eligible',
    user: identity,
    invitation: context,
  };
}
export async function acceptInvitation(
  userId: string,
  token: string | undefined,
  expectedId: string,
) {
  objectIdSchema.parse(expectedId);
  const db = await membershipDatabase();
  return db.connection.transaction(async (session) => {
    const usable = await usableInvitation(token, session);
    if (!usable) throw invalid();
    const { invite } = usable;
    if (invite._id.toString() !== expectedId)
      throw new ApiError({
        status: 409,
        code: 'INVITATION_CONTEXT_CHANGED',
        message: 'Your invitation changed. Review it again before accepting.',
      });
    if (!(await lockWeddingMembership(invite.weddingId, session)))
      throw invalid();
    const user = await loadOrganizerMembership(userId, session);
    if (!user)
      throw new ApiError({
        status: 401,
        code: 'UNAUTHENTICATED',
        message: 'Please log in.',
      });
    if (user.emailNormalized !== invite.emailNormalized)
      throw new ApiError({
        status: 403,
        code: 'INVITATION_EMAIL_MISMATCH',
        message: 'Sign in with the invited email to accept.',
      });
    if (invite.state === 'accepted' && invite.consumedBy?.toString() !== userId)
      throw invalid();
    if (user.weddingId?.toString() === invite.weddingId.toString())
      return { joined: true, replayed: true };
    if (user.weddingId)
      throw new ApiError({
        status: 409,
        code: 'USER_ALREADY_IN_WEDDING',
        message: 'Your account already belongs to a different wedding.',
      });
    if (invite.state !== 'pending') throw invalid();
    const now = new Date();
    const claimed = await attachInvitedOrganizer(
      userId,
      invite.weddingId,
      session,
    );
    if (claimed.modifiedCount !== 1)
      throw new ApiError({
        status: 409,
        code: 'USER_ALREADY_IN_WEDDING',
        message: 'Your membership changed. Refresh and try again.',
      });
    if (
      (await consumeInvite(invite._id, user._id, now, session))
        .modifiedCount !== 1
    )
      throw invalid();
    return { joined: true, replayed: false };
  });
}
export async function invitationEmailEligible(
  _userId: string,
  tokenHash: string,
  now: Date,
  weddingId?: string,
) {
  await membershipDatabase();
  const invite = await findInviteByHash(tokenHash);
  if (
    !invite ||
    invite.state !== 'pending' ||
    invite.expiresAt <= now ||
    invite.weddingId.toString() !== weddingId ||
    !(await activeWeddingForMembership(invite.weddingId))
  )
    return false;
  const inviter = await loadOrganizerMembership(invite.invitedBy.toString());
  return (
    !!inviter &&
    inviter.role === 'admin' &&
    inviter.weddingId?.toString() === weddingId
  );
}
