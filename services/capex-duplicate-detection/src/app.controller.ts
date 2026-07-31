import { Controller, Get } from '@nestjs/common';
import { Public } from '@capexbe/auth/decorators/public.decorator';

@Controller()
export class AppController {
  @Public()
  @Get('health')
  health() {
    return { ok: true, service: 'capex-duplicate-detection', version: '0.1.0' };
  }

  @Public()
  @Get('ready')
  ready() {
    return { ready: true };
  }
}
