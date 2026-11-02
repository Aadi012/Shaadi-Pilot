import 'server-only';
import { randomUUID, createHash } from 'node:crypto';
import { Types, type ClientSession } from 'mongoose';
import { z } from 'zod';
import { ApiError } from '@/lib/api/errors';
import { hashSecret } from '@/modules/auth/security.server';
import { loadOrganizerMembership } from '@/modules/auth/service.server';
import {
  activeWeddingForMembership,
  lockWeddingMembership,
} from '@/modules/weddings/service.server';
import { planningEvents } from '@/modules/events/service.server';
import {
  objectIdSchema,
  inviteKeySchema,
} from '@/modules/memberships/contracts';
import {
  uploadInput,
  MAX_PHOTO_BYTES,
  type PhotoDto,
  type GalleryPage,
} from './contracts';
import { galleryLimits } from './config.server';
import { photoStorage, type PhotoStorage } from './storage.server';
import { sanitizePhoto } from './image.server';
import * as repo from './repository.server';
const fail = (status: number, code: string, message: string) =>
  new ApiError({ status, code, message });
async function tenant(
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
function dto(row: repo.PhotoRecord): PhotoDto {
  return {
    id: row._id.toString(),
    name: row.name,
    state: row.state,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
    version: row.__v,
    width: row.width,
    height: row.height,
    eventId: row.eventId?.toString(),
    error: row.error,
  };
}
function configured(storage: PhotoStorage) {
  if (!storage.configured())
    throw fail(
      503,
      'SERVICE_UNAVAILABLE',
      'Private photo storage is not configured yet.',
    );
}
const oid = (id: string) => new Types.ObjectId(objectIdSchema.parse(id));
export async function listPhotos(
  userId: string,
  input: unknown = {},
  storage: PhotoStorage = photoStorage,
): Promise<GalleryPage> {
  const query = z
    .strictObject({ cursor: z.string().max(150).optional() })
    .parse(input);
  await repo.database();
  const weddingId = await tenant(userId);
  let before: Types.ObjectId | undefined;
  if (query.cursor) {
    const [w, id, ...rest] = query.cursor.split(':');
    if (w !== weddingId.toString() || rest.length)
      throw fail(
        400,
        'INVALID_QUERY',
        'Refresh the gallery before loading more.',
      );
    before = oid(id);
  }
  const rows = await repo.list(weddingId, before);
  const limits = galleryLimits();
  const usage = await repo.usage(weddingId);
  return {
    weddingId: weddingId.toString(),
    photos: rows.slice(0, 24).map(dto),
    nextCursor: rows.length > 24 ? weddingId + ':' + rows[23]._id : null,
    usage: {
      count: usage.count,
      bytes: usage.bytes,
      maxCount: limits.count,
      maxBytes: limits.bytes,
    },
    storageReady: storage.configured(),
  };
}
export async function createUpload(
  userId: string,
  expected: string,
  input: unknown,
  key: string | undefined,
  storage: PhotoStorage = photoStorage,
) {
  const data = uploadInput.parse(input);
  objectIdSchema.parse(expected);
  const requestId = hashSecret(
    userId + ':' + expected + ':photo:' + inviteKeySchema.parse(key),
  );
  const hash = hashSecret(JSON.stringify(data));
  configured(storage);
  const db = await repo.database();
  const row = await db.connection.transaction(async (session) => {
    const weddingId = await tenant(userId, expected, session);
    if (!(await lockWeddingMembership(weddingId, session)))
      throw fail(404, 'NOT_FOUND', 'Wedding not found.');
    const receipt = await repo.receipt(requestId, session);
    if (receipt) {
      if (receipt.hash !== hash)
        throw fail(
          409,
          'IDEMPOTENCY_CONFLICT',
          'This upload key was used for a different file.',
        );
      const row = await repo.find(weddingId, receipt.photoId!, session);
      if (!row)
        throw fail(
          409,
          'UPLOAD_UNAVAILABLE',
          'This upload is no longer available.',
        );
      return row;
    }
    if (
      data.eventId &&
      (await planningEvents(weddingId, [oid(data.eventId)], session)).length !==
        1
    )
      throw fail(404, 'NOT_FOUND', 'Function not found.');
    const limits = galleryLimits(),
      usage = await repo.usage(weddingId, session);
    if (
      usage.count >= limits.count ||
      usage.bytes + MAX_PHOTO_BYTES > limits.bytes
    )
      throw fail(
        409,
        'GALLERY_FULL',
        'The gallery storage limit has been reached. Remove photos or wait for cancelled uploads to finish cleanup.',
      );
    const id = new Types.ObjectId();
    const now = Date.now();
    await repo.insert(
      {
        _id: id,
        weddingId,
        uploadedById: oid(userId),
        eventId: data.eventId ? oid(data.eventId) : undefined,
        name: data.fileName,
        mimeType: data.mimeType,
        expectedBytes: data.sizeBytes,
        sizeBytes: 0,
        state: 'pending',
        stagingKey:
          'weddings/' + weddingId + '/staging/' + id + '/' + randomUUID(),
        cleanupKeys: [],
        uploadUntil: new Date(now + 5 * 60000),
        expiresAt: new Date(now + 15 * 60000),
        cleanupAfter: new Date(now + 20 * 60000),
        __v: 0,
      },
      session,
    );
    await repo.saveReceipt(
      { _id: requestId, weddingId, hash, photoId: id },
      session,
    );
    return (await repo.find(weddingId, id, session))!;
  });
  if (row.state !== 'pending' || row.uploadUntil <= new Date())
    throw fail(
      409,
      'UPLOAD_UNAVAILABLE',
      'This upload has finished or expired. Refresh the gallery before starting a new upload.',
    );
  const seconds = Math.max(
    1,
    Math.floor((row.uploadUntil.getTime() - Date.now()) / 1000),
  );
  const uploadUrl = await storage.uploadUrl(
    row.stagingKey,
    row.mimeType,
    seconds,
    row.expectedBytes,
  );
  await tenant(userId, expected);
  return {
    weddingId: expected,
    photo: dto(row),
    uploadUrl,
    requiredHeaders: { 'Content-Type': row.mimeType },
    expiresAt: row.uploadUntil.toISOString(),
  };
}
export async function completeUpload(
  userId: string,
  expected: string,
  id: string,
  storage: PhotoStorage = photoStorage,
) {
  configured(storage);
  const db = await repo.database();
  const photoId = oid(id),
    owner = randomUUID();
  const claimed = await db.connection.transaction(async (session) => {
    const weddingId = await tenant(userId, expected, session);
    await lockWeddingMembership(weddingId, session);
    const row = await repo.find(weddingId, photoId, session);
    if (!row) throw fail(404, 'NOT_FOUND', 'Photo not found.');
    if (row.state === 'ready') return row;
    if (
      !['pending', 'processing'].includes(row.state) ||
      row.expiresAt <= new Date()
    )
      throw fail(
        409,
        'UPLOAD_UNAVAILABLE',
        'This upload is no longer available.',
      );
    if (
      row.state === 'processing' &&
      row.leaseUntil &&
      row.leaseUntil > new Date()
    )
      throw fail(
        409,
        'PHOTO_PROCESSING',
        'This photo is being verified. Refresh and retry shortly.',
      );
    return (await repo.change(
      weddingId,
      photoId,
      { state: row.state },
      {
        $set: {
          state: 'processing',
          leaseOwner: owner,
          leaseUntil: new Date(Date.now() + 2 * 60000),
        },
        $inc: { __v: 1 },
      },
      session,
    ))!;
  });
  if (claimed.state === 'ready')
    return { weddingId: expected, photo: dto(claimed) };
  try {
    const bytes = await storage.read(claimed.stagingKey, MAX_PHOTO_BYTES);
    if (bytes.length !== claimed.expectedBytes)
      throw fail(
        422,
        'INVALID_PHOTO',
        'The uploaded size does not match the selected file. Start a new upload.',
      );
    const result = await sanitizePhoto(bytes, claimed.mimeType);
    const digest = createHash('sha256').update(result.bytes).digest('hex');
    const objectKey =
      'weddings/' + expected + '/photos/' + id + '/' + digest + '.webp';
    const reserved = await repo.change(
      claimed.weddingId,
      photoId,
      { state: 'processing', leaseOwner: owner },
      { $addToSet: { cleanupKeys: objectKey } },
    );
    if (!reserved)
      throw fail(
        409,
        'UPLOAD_UNAVAILABLE',
        'This upload changed. Refresh the gallery.',
      );
    await storage.put(objectKey, result.bytes);
    const row = await db.connection.transaction(async (session) => {
      const weddingId = await tenant(userId, expected, session);
      await lockWeddingMembership(weddingId, session);
      if (
        claimed.eventId &&
        (await planningEvents(weddingId, [claimed.eventId], session)).length !==
          1
      )
        throw fail(
          409,
          'UPLOAD_UNAVAILABLE',
          'The function changed. Cancel this upload and review it.',
        );
      const row = await repo.change(
        weddingId,
        photoId,
        { state: 'processing', leaseOwner: owner },
        {
          $set: {
            state: 'ready',
            objectKey,
            sizeBytes: result.bytes.length,
            width: result.width,
            height: result.height,
            cleanupAfter: new Date(
              Math.max(Date.now(), claimed.uploadUntil.getTime()) + 5 * 60000,
            ),
          },
          $unset: { leaseOwner: '', leaseUntil: '', error: '' },
          $inc: { __v: 1 },
        },
        session,
      );
      if (!row)
        throw fail(
          409,
          'UPLOAD_UNAVAILABLE',
          'This upload changed. Refresh the gallery.',
        );
      return row;
    });
    return { weddingId: expected, photo: dto(row) };
  } catch (error) {
    const invalid =
      error instanceof ApiError &&
      ['INVALID_PHOTO', 'FILE_TOO_LARGE'].includes(error.code);
    await repo.change(
      claimed.weddingId,
      photoId,
      { state: 'processing', leaseOwner: owner },
      {
        $set: {
          state: invalid ? 'rejected' : 'pending',
          ...(invalid
            ? {
                error:
                  'File validation failed. Remove this upload and choose another photo.',
              }
            : {}),
        },
        $unset: { leaseOwner: '', leaseUntil: '' },
        $inc: { __v: 1 },
      },
    );
    throw error;
  }
}
export async function photoView(
  userId: string,
  id: string,
  storage: PhotoStorage = photoStorage,
) {
  configured(storage);
  await repo.database();
  const weddingId = await tenant(userId);
  const row = await repo.find(weddingId, oid(id));
  if (!row || row.state !== 'ready' || !row.objectKey)
    throw fail(404, 'NOT_FOUND', 'Photo not found.');
  const url = await storage.viewUrl(row.objectKey);
  await tenant(userId, weddingId.toString());
  const latest = await repo.find(weddingId, row._id);
  if (latest?.state !== 'ready')
    throw fail(404, 'NOT_FOUND', 'Photo not found.');
  return {
    weddingId: weddingId.toString(),
    url,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  };
}
export async function removePhoto(
  userId: string,
  expected: string,
  id: string,
  version: number,
) {
  const db = await repo.database();
  return db.connection.transaction(async (session) => {
    const weddingId = await tenant(userId, expected, session);
    await lockWeddingMembership(weddingId, session);
    const row = await repo.find(weddingId, oid(id), session);
    if (!row) throw fail(404, 'NOT_FOUND', 'Photo not found.');
    if (['deleting', 'deleted'].includes(row.state))
      return { weddingId: expected, photo: dto(row) };
    if (row.__v !== version)
      throw fail(
        412,
        'PRECONDITION_FAILED',
        'This photo changed. Refresh and review before removing.',
      );
    const updated = await repo.change(
      weddingId,
      row._id,
      { __v: version },
      {
        $set: {
          state: 'deleting',
          cleanupAfter: new Date(
            Math.max(
              Date.now(),
              row.uploadUntil.getTime(),
              row.leaseUntil?.getTime() ?? 0,
            ) +
              5 * 60000,
          ),
        },
        $unset: { leaseOwner: '', leaseUntil: '' },
        $inc: { __v: 1 },
      },
      session,
    );
    if (!updated)
      throw fail(
        412,
        'PRECONDITION_FAILED',
        'This photo changed. Refresh before removing.',
      );
    return { weddingId: expected, photo: dto(updated) };
  });
}
export async function cleanupPhotos(storage: PhotoStorage = photoStorage) {
  configured(storage);
  await repo.database();
  let cleaned = 0;
  for (const row of [
    ...(await repo.cleanupCandidates(new Date())),
    ...(await repo.activeStaging(new Date())),
  ]) {
    // Claim before provider calls; completion cannot revive an expired upload.
    const ready = row.state === 'ready';
    const owner = randomUUID();
    const claimed = await repo.change(
      row.weddingId,
      row._id,
      { state: row.state, __v: row.__v, cleanupAfter: { $lte: new Date() } },
      {
        $set: {
          state: ready ? 'ready' : 'deleting',
          cleanupAfter: new Date(Date.now() + 5 * 60000),
          leaseOwner: owner,
        },
        $inc: { __v: 1 },
      },
    );
    if (!claimed) continue;
    const keys = new Set([
      row.stagingKey,
      ...row.cleanupKeys,
      ...(!ready && row.objectKey ? [row.objectKey] : []),
    ]);
    if (ready && row.objectKey) keys.delete(row.objectKey);
    try {
      for (const key of keys) {
        if (!key.startsWith('weddings/' + row.weddingId + '/'))
          throw fail(
            503,
            'SERVICE_UNAVAILABLE',
            'Photo cleanup is unavailable.',
          );
        await storage.remove(key);
      }
      await repo.change(
        row.weddingId,
        row._id,
        { state: ready ? 'ready' : 'deleting', leaseOwner: owner },
        {
          $set: {
            ...(ready
              ? { cleanupKeys: [] }
              : { state: 'deleted', sizeBytes: 0 }),
            cleanupAfter: new Date(8640000000000000),
          },
          $unset: { leaseOwner: '' },
          $inc: { __v: 1 },
        },
      );
      cleaned++;
    } catch {
      /* Retry durable cleanup later; never log provider data. */
    }
  }
  return { cleaned };
}
