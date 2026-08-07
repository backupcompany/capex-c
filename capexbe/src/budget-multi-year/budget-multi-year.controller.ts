import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  BUDGET_STACK_CREATE,
  BUDGET_STACK_UPDATE,
  BUDGET_STACK_VIEW,
} from '../auth/budget-permission.constants';
import {
  getCallerUserId,
  requireAccessTokenFromRequest,
} from '../auth/request-access-token.util';
import { BudgetMultiYearService } from './budget-multi-year.service';

class BudgetMultiYearUserBodyDto {
  userId!: number;
}

class BudgetMultiYearPeriodBudgetsDto extends BudgetMultiYearUserBodyDto {
  multiYearName!: string;
}

class BudgetMultiYearSaveDto extends BudgetMultiYearUserBodyDto {
  multiYear!: Record<string, unknown>;
}

class BudgetMultiYearCreatePeriodDto extends BudgetMultiYearUserBodyDto {
  periodName!: string;
  startDate!: string;
  endDate!: string;
  multiYearName!: string;
}

class BudgetMultiYearSavePeriodDto extends BudgetMultiYearUserBodyDto {
  period!: Record<string, unknown>;
  categoryIds?: string[];
}

class BudgetMultiYearSaveArchetypePlansDto extends BudgetMultiYearUserBodyDto {
  periodName!: string;
  rows!: Array<{ archetypeId: string; categoryId: string; budgetPlan: number }>;
}

class BudgetMultiYearSaveHuPlansDto extends BudgetMultiYearUserBodyDto {
  periodName!: string;
  rows!: Array<{ hospitalUnitId: string; categoryId: string; budgetPlan: number }>;
}

@Controller('budget-multi-year')
export class BudgetMultiYearController {
  constructor(private readonly budgetMultiYearService: BudgetMultiYearService) {}

  @BUDGET_STACK_VIEW
  @Post('page-bundle')
  async pageBundle(@Req() req: Request, @Body() body: BudgetMultiYearUserBodyDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetMultiYearService.loadPageBundle(token, getCallerUserId(req));
  }

  @BUDGET_STACK_VIEW
  @Post('period-budgets')
  async periodBudgets(@Req() req: Request, @Body() body: BudgetMultiYearPeriodBudgetsDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetMultiYearService.loadPeriodBudgets(
      token,
      getCallerUserId(req),
      body.multiYearName,
    );
  }

  @BUDGET_STACK_UPDATE
  @Post('save-multi-year')
  async saveMultiYear(@Req() req: Request, @Body() body: BudgetMultiYearSaveDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetMultiYearService.saveMultiYear(
      token,
      getCallerUserId(req),
      body.multiYear ?? {},
    );
  }

  @BUDGET_STACK_CREATE
  @Post('create-period')
  async createPeriod(@Req() req: Request, @Body() body: BudgetMultiYearCreatePeriodDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetMultiYearService.createPeriod(token, getCallerUserId(req), body);
  }

  @BUDGET_STACK_UPDATE
  @Post('save-period-plans')
  async savePeriodPlans(@Req() req: Request, @Body() body: BudgetMultiYearSavePeriodDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetMultiYearService.savePeriodCategoryPlans(
      token,
      getCallerUserId(req),
      body.period ?? {},
      body.categoryIds,
    );
  }

  @BUDGET_STACK_UPDATE
  @Post('save-archetype-plans')
  async saveArchetypePlans(@Req() req: Request, @Body() body: BudgetMultiYearSaveArchetypePlansDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetMultiYearService.saveArchetypeBudgetPlans(
      token,
      getCallerUserId(req),
      body.periodName,
      body.rows ?? [],
    );
  }

  @BUDGET_STACK_UPDATE
  @Post('save-hu-plans')
  async saveHuPlans(@Req() req: Request, @Body() body: BudgetMultiYearSaveHuPlansDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetMultiYearService.saveHuBudgetPlans(
      token,
      getCallerUserId(req),
      body.periodName,
      body.rows ?? [],
    );
  }
}
