import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateCalendarEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  location?: string;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  @IsOptional()
  endsAt?: string;

  @IsBoolean()
  @IsOptional()
  allDay?: boolean;

  @IsString()
  @IsOptional()
  organizationId?: string;
}

export class UpdateCalendarEventDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  location?: string;

  @IsDateString()
  @IsOptional()
  startsAt?: string;

  @IsDateString()
  @IsOptional()
  endsAt?: string;

  @IsBoolean()
  @IsOptional()
  allDay?: boolean;
}
