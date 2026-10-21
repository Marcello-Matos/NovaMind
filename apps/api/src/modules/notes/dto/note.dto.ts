import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateNoteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  content!: string;

  @IsString()
  @IsOptional()
  organizationId?: string;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  tags?: string[];

  @IsBoolean()
  @IsOptional()
  pinned?: boolean;
}

export class UpdateNoteDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  title?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20000)
  content?: string;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  tags?: string[];

  @IsBoolean()
  @IsOptional()
  pinned?: boolean;
}
