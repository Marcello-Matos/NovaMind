import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MemoryModule } from '../memory/memory.module';
import { UsageModule } from '../usage/usage.module';
import { OpenAiService } from './openai.service';
import { OrchestratorService } from './orchestrator.service';
import { ToolExecutorService } from './tools/tool-executor.service';

@Module({
  imports: [AuditModule, MemoryModule, UsageModule],
  providers: [OpenAiService, OrchestratorService, ToolExecutorService],
  exports: [OpenAiService, OrchestratorService, ToolExecutorService],
})
export class AiModule {}
