import 'server-only';
import { ApiError } from '@/lib/api/errors';
import {
  loadOrganizerMembership,
  attachCreatedWedding,
} from '@/modules/auth/service.server';
import { hashSecret } from '@/modules/auth/security.server';
import {
  createWeddingSchema,
  idempotencySchema,
  editWeddingSchema,
  type WeddingDto,
} from './contracts';
import {
  findCreation,
  findWedding,
  insertCreation,
  insertWedding,
  slugExists,
  weddingDatabase,
  updateWeddingDetails,
  lockMembershipWedding,
} from './repository.server';
import type { WeddingRecord } from './models.server';
// Callers must first resolve the organizer or a validated invitation capability.
export const lockWeddingMembership = lockMembershipWedding;
export const activeWeddingForMembership = findWedding;
const conflict = () =>
  new ApiError({
    status: 409,
    code: 'USER_ALREADY_IN_WEDDING',
    message: 'Your account already belongs to a wedding.',
  });
export const weddingDto = (wedding: WeddingRecord): WeddingDto => ({
  id: wedding._id.toString(),
  displayNames: {
    partnerOne: wedding.displayNames.partnerOne,
    partnerTwo: wedding.displayNames.partnerTwo,
    intro: wedding.displayNames.intro,
  },
  weddingDate: wedding.weddingDate,
  location: wedding.defaultLocation.name,
  timezone: wedding.timezone,
  slug: wedding.slug,
  isPublished: wedding.isPublished,
  version: wedding.__v ?? 0,
});
export async function editWedding(
  userId: string,
  input: unknown,
  version: number,
) {
  const data = editWeddingSchema.parse(input);
  const db = await weddingDatabase();
  return db.connection.transaction(async (transaction) => {
    const user = await loadOrganizerMembership(userId, transaction);
    if (!user)
      throw new ApiError({
        status: 401,
        code: 'UNAUTHENTICATED',
        message: 'Please log in.',
      });
    if (!user.weddingId || !['admin', 'manager'].includes(user.role ?? ''))
      throw new ApiError({
        status: 403,
        code: 'FORBIDDEN',
        message: 'Wedding access is unavailable.',
      });
    const wedding = await updateWeddingDetails(
      user.weddingId,
      version,
      data,
      transaction,
    );
    if (!wedding) {
      if (!(await findWedding(user.weddingId, transaction)))
        throw new ApiError({
          status: 404,
          code: 'NOT_FOUND',
          message: 'Wedding not found.',
        });
      throw new ApiError({
        status: 412,
        code: 'PRECONDITION_FAILED',
        message:
          'Wedding details changed. Load the latest details before saving again.',
      });
    }
    return weddingDto(wedding);
  });
}
export async function currentWedding(userId: string) {
  await weddingDatabase();
  const user = await loadOrganizerMembership(userId);
  if (!user)
    throw new ApiError({
      status: 401,
      code: 'UNAUTHENTICATED',
      message: 'Please log in.',
    });
  if (!user.weddingId) return null;
  if (!['admin', 'manager'].includes(user.role ?? ''))
    throw new ApiError({
      status: 403,
      code: 'FORBIDDEN',
      message: 'Wedding access is unavailable.',
    });
  const wedding = await findWedding(user.weddingId);
  if (!wedding)
    throw new ApiError({
      status: 404,
      code: 'NOT_FOUND',
      message: 'Wedding not found.',
    });
  return {
    wedding: weddingDto(wedding),
    role: user.role as 'admin' | 'manager',
  };
}
export async function createWedding(
  userId: string,
  input: unknown,
  key: unknown,
  attempt = 0,
) {
  const data = createWeddingSchema.parse(input);
  const idempotency = idempotencySchema.parse(key);
  const db = await weddingDatabase();
  const receiptId = hashSecret(`${userId}:${idempotency}`);
  const requestHash = hashSecret(JSON.stringify(data));
  try {
    return await db.connection.transaction(async (transaction) => {
      const user = await loadOrganizerMembership(userId, transaction);
      if (!user)
        throw new ApiError({
          status: 401,
          code: 'UNAUTHENTICATED',
          message: 'Please log in.',
        });
      const receipt = await findCreation(receiptId, transaction);
      if (receipt) {
        if (receipt.requestHash !== requestHash)
          throw new ApiError({
            status: 409,
            code: 'IDEMPOTENCY_CONFLICT',
            message: 'This request key was already used for different details.',
          });
        if (user.weddingId?.toString() !== receipt.weddingId.toString())
          throw conflict();
        const wedding = await findWedding(receipt.weddingId, transaction);
        if (!wedding)
          throw new ApiError({
            status: 404,
            code: 'NOT_FOUND',
            message: 'Wedding not found.',
          });
        return { wedding: weddingDto(wedding), replayed: true };
      }
      if (user.weddingId) throw conflict();
      const wedding = await insertWedding(
        {
          displayNames: data.displayNames,
          weddingDate: data.weddingDate,
          defaultLocation: { name: data.location },
          timezone: data.timezone,
          slug: data.slug,
          isPublished: false,
          status: 'active',
          createdBy: user._id,
        },
        transaction,
      );
      const claim = await attachCreatedWedding(
        userId,
        wedding._id,
        transaction,
      );
      if (claim.modifiedCount !== 1) throw conflict();
      await insertCreation(
        {
          _id: receiptId,
          requestHash,
          userId: user._id,
          weddingId: wedding._id,
        },
        transaction,
      );
      return { wedding: weddingDto(wedding), replayed: false };
    });
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    ) {
      const receipt = await findCreation(receiptId);
      if (receipt && attempt === 0) return createWedding(userId, input, key, 1);
      if (await slugExists(data.slug))
        throw new ApiError({
          status: 409,
          code: 'SLUG_TAKEN',
          message: 'This wedding address is already taken. Choose another.',
        });
    }
    throw error;
  }
}
export async function weddingSlugAvailable(userId: string, slug: string) {
  await weddingDatabase();
  const user = await loadOrganizerMembership(userId);
  if (!user)
    throw new ApiError({
      status: 401,
      code: 'UNAUTHENTICATED',
      message: 'Please log in.',
    });
  if (user.weddingId) throw conflict();
  return !(await slugExists(slug));
}
