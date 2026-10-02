import { Module } from '@nestjs/common';
import { RepositoryModule } from '../../repository/repository.module';
import { CareTasksController } from './care-tasks.controller';
import { CareTasksService } from './care-tasks.service';

@Module({
  imports: [RepositoryModule],
  controllers: [CareTasksController],
  providers: [CareTasksService],
})
export class CareTasksModule {}
