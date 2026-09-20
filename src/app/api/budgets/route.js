import { D1Controller } from '@/lib/d1-controller';
import { getAuthenticatedUser } from '@/lib/auth';
import { apiSuccess, apiError } from '@/lib/response';
import { guardRateLimit } from '@/lib/rateLimit';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';

export async function GET(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  const { searchParams } = new URL(request.url);
  const year = searchParams.get('year') || new Date().getFullYear();

  try {
    const controller = new D1Controller(user.role, user.id, user.name, user.email);
    const budgets = await controller.getBudgets(year);
    const balances = await controller.getBalances();

    // Attach current spend/income to each budget
    const enrichedBudgets = budgets.map(b => {
      const fundBal = balances.find(fb => fb.id === b.fund_id);
      return {
        ...b,
        currentBalance: fundBal ? fundBal.balance : 0,
        fundName: fundBal ? fundBal.name : (b.fund_name || b.fund_id),
        isRestricted: fundBal ? fundBal.is_restricted : false
      };
    });

    return apiSuccess(enrichedBudgets);
  } catch (err) {
    return apiError(err.message, 500, { code: 'BUDGET_ERROR' });
  }
}

export async function POST(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  if (user.role !== 'ADMIN') {
    return apiError('Forbidden: Only Administrators can set fund budgets.', 403, { code: 'FORBIDDEN' });
  }

  const rateGuard = await guardRateLimit(request, 'budget_save', config.rateLimit.writeMaxAttempts, config.rateLimit.writeWindowMs, user.id);
  if (!rateGuard.isAllowed) {
    return rateGuard.errorResponse;
  }

  try {
    const body = await request.json();
    if (!body.fund_id) {
      return apiError('Fund ID is required for budget setting.', 400, { code: 'INVALID_PAYLOAD' });
    }

    const controller = new D1Controller(user.role, user.id, user.name, user.email);
    const saved = await controller.saveBudget(body);

    logger.info('Fund budget saved in D1', { fundId: body.fund_id, year: saved.fiscal_year, userId: user.id });
    return apiSuccess(saved, { message: 'Budget saved successfully', headers: rateGuard.headers });
  } catch (err) {
    return apiError(err.message, 400, { code: 'SAVE_ERROR' });
  }
}
