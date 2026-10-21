import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
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
import { CalendarModule } from './modules/calendar/calendar.module';
import { HabitsModule } from './modules/habits/habits.module';
import { NotesModule } from './modules/notes/notes.module';
import { RemindersModule } from './modules/reminders/reminders.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    ScheduleModule.forRoot(),
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
    CalendarModule,
    HabitsModule,
    NotesModule,
    RemindersModule,
    IntegrationsModule,
  ],
})
export class AppModule {}
