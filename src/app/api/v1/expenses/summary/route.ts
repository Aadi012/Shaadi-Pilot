import { withApiHandler } from '@/lib/api/route-handler.server';
import { apiSuccess } from '@/lib/api/responses.server';
import { ApiError } from '@/lib/api/errors';
import { currentSession } from '@/modules/auth/http.server';
import { expenseSummary } from '@/modules/expenses/service.server';
export const runtime = 'nodejs';
export const GET = withApiHandler(
  '/api/v1/expenses/summary',
  async (_request, _context, requestId) => {
    const current = await currentSession(true);
    if (!current)
      throw new ApiError({
        status: 401,
        code: 'UNAUTHENTICATED',
        message: 'Please log in.',
      });
    return apiSuccess(
      await expenseSummary(current.user._id.toString()),
      requestId,
    );
  },
);
