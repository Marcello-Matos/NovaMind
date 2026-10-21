import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateReminderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsDateString()
  remindAt!: string;

  @IsIn(['NONE', 'DAILY', 'WEEKLY'])
  @IsOptional()
  repeatRule?: 'NONE' | 'DAILY' | 'WEEKLY';

  @IsString()
  @IsOptional()
  @MaxLength(50)
  taskId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  eventId?: string;
}

export class UpdateReminderDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  title?: string;

  @IsDateString()
  @IsOptional()
  remindAt?: string;

  @IsIn(['NONE', 'DAILY', 'WEEKLY'])
  @IsOptional()
  repeatRule?: 'NONE' | 'DAILY' | 'WEEKLY';
}
