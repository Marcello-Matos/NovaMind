import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { AiModule } from './modules/ai/ai.module';
import { MemoryModule } from './modules/memory/memory.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { LeadsModule } from './modules/leads/leads.module';
import { KnowledgeBaseModule } from './modules/knowledge-base/knowledge-base.module';
import { UsageModule } from './modules/usage/usage.module';
import { AuditModule } from './modules/audit/audit.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    ConversationsModule,
    AiModule,
    MemoryModule,
    TasksModule,
    LeadsModule,
    KnowledgeBaseModule,
    UsageModule,
    AuditModule,
    AdminModule,
  ],
})
export class AppModule {}
