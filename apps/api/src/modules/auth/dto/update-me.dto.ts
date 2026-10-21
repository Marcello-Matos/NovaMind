import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * Formato do avatar (data URL de imagem ou URL https) é validado no
 * serviço. `null` remove a foto. Limite de 150KB após codificação —
 * o app envia JPEG 256x256 (~20KB).
 */
export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(200_000, { message: 'Imagem muito grande (máx. ~150KB)' })
  avatarUrl?: string | null;
}
