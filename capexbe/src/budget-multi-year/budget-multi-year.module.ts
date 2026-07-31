import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../auth/auth-core.module';
import { BudgetMultiYearController } from './budget-multi-year.controller';
import { BudgetMultiYearService } from './budget-multi-year.service';

@Module({
  imports: [AuthCoreModule],
  controllers: [BudgetMultiYearController],
  providers: [BudgetMultiYearService],
})
export class BudgetMultiYearModule {}
