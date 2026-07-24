import { Global, Module } from '@nestjs/common';
import { CacheAsideService } from './cache-aside.service';

@Global()
@Module({
  providers: [CacheAsideService],
  exports: [CacheAsideService],
})
export class SharedModule {}
