import 'server-only';
import { ApiError } from '@/lib/api/errors';
import { loginSchema, registerSchema, type Organizer } from './contracts';
import type { UserRecord } from './models.server';
import {
  authDatabase,
  consumeLimit,
  isDuplicate,
  createUser,
  findLoginUser,
  recordLogin,
  createSession,
  revokeSession,
} from './repository.server';
import {
  ABSOLUTE_MS,
  hashPassword,
  hashSecret,
  IDLE_MS,
  newSecret,
  verifyPassword,
} from './security.server';

export function organizerDto(user: UserRecord): Organizer {
  return {
    id: user._id.toString(),
    displayName: user.displayName,
    email: user.emailNormalized,
    weddingId: user.weddingId?.toString() ?? null,
    role: user.role,
  };
}
export async function authenticate(
  action: 'register' | 'login',
  input: unknown,
  address: string,
  oldToken?: string,
) {
  // Invalid credentials and schema-invalid inputs consume the network bucket too.
  await consumeLimit(`${action}:ip:${address}`, action === 'login' ? 50 : 20);
  const registration =
    action === 'register' ? registerSchema.parse(input) : null;
  const data = registration ?? loginSchema.parse(input);
  await consumeLimit(
    `${action}:account:${data.email}`,
    action === 'login' ? 10 : 5,
  );
  const db = await authDatabase();
  const now = new Date();
  const passwordHash =
    action === 'register' ? await hashPassword(data.password) : undefined;
  if (registration) {
    try {
      await db.connection.transaction((transaction) =>
        createUser(
          {
            emailNormalized: registration.email,
            displayName: registration.displayName,
            passwordHash: passwordHash!,
            weddingId: null,
            role: null,
            status: 'active',
            lastLoginAt: null,
          },
          transaction,
        ),
      );
    } catch (error) {
      // Unique email races and existing accounts have the same public outcome.
      // Never overwrite an existing account or issue a session for it.
      if (!isDuplicate(error)) throw error;
    }
    return null;
  }
  const token = newSecret();
  const absoluteExpiresAt = new Date(now.getTime() + ABSOLUTE_MS);
  const existing = await findLoginUser(data.email);
  if (
    !(await verifyPassword(existing?.passwordHash, data.password)) ||
    existing?.status !== 'active'
  ) {
    throw new ApiError({
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Email or password is incorrect.',
    });
  }
  const user = await db.connection.transaction(async (transaction) => {
    const user = existing
      ? await recordLogin(existing, now, transaction)
      : null;
    if (!user)
      throw new ApiError({
        status: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'Email or password is incorrect.',
      });
    if (oldToken) await revokeSession(oldToken, now, transaction);
    await createSession(
      {
        userId: user._id,
        tokenHash: hashSecret(token),
        createdAt: now,
        lastSeenAt: now,
        expiresAt: new Date(now.getTime() + IDLE_MS),
        absoluteExpiresAt,
        revokedAt: null,
      },
      transaction,
    );
    return organizerDto(user);
  });
  return { user, token, absoluteExpiresAt };
}
export async function logout(token: string) {
  await authDatabase();
  const now = new Date();
  await revokeSession(token, now);
}
