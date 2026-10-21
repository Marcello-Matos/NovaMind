import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateMemoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  key!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  value!: string;
}

export class UpdateMemoryDto {
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  value?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}
