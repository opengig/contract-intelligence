import { Module } from '@nestjs/common';
import { DeepAgentsController } from './deep-agents.controller';
import { DeepAgentsService } from './deep-agents.service';
import { SandboxManagerService } from './sandbox-manager.service';
import { ContractRouterService } from './contract-router.service';

@Module({
  controllers: [DeepAgentsController],
  providers: [DeepAgentsService, SandboxManagerService, ContractRouterService],
})
export class DeepAgentsModule {}
