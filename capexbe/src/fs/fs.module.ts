import { Module } from '@nestjs/common';
import { FsCoreModule } from './fs-core.module';
import { FsController } from './fs.controller';

@Module({
  imports: [FsCoreModule],
  controllers: [FsController],
  exports: [FsCoreModule],
})
export class FsModule {}
