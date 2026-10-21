import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
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

export class ConfirmedActionDto {
  @IsString()
  @IsNotEmpty()
  tool!: string;

  @IsObject()
  parameters!: Record<string, unknown>;
}

export class SendMessageDto {
  @IsString()
  @IsOptional()
  @MaxLength(8000)
  content?: string;

  /** Ações sensíveis aprovadas pelo usuário (pendingActions confirmadas). */
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ConfirmedActionDto)
  @IsOptional()
  confirmedActions?: ConfirmedActionDto[];
}
