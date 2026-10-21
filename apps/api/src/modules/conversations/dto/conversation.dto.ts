import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { AgentType } from '@prisma/client';

export class CreateConversationDto {
  @IsEnum(AgentType)
  @IsOptional()
  agent?: AgentType;

  @IsString()
  @IsOptional()
  organizationId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(140)
  title?: string;
}

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  content!: string;
}
