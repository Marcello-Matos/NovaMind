import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateHabitDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @IsString()
  @IsOptional()
  @MaxLength(8)
  icon?: string;

  @IsString()
  @IsOptional()
  @MaxLength(9)
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'color deve ser hex (#RRGGBB)' })
  color?: string;

  // Dias da semana em que o hábito vale: "1,3,5" (0=domingo)
  @IsString()
  @IsOptional()
  @Matches(/^([0-6])(,[0-6])*$/, { message: 'daysOfWeek inválido' })
  daysOfWeek?: string;
}

export class UpdateHabitDto {
  @IsString()
  @IsOptional()
  @MaxLength(80)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(8)
  icon?: string;

  @IsString()
  @IsOptional()
  @MaxLength(9)
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color?: string;

  @IsString()
  @IsOptional()
  @Matches(/^([0-6])(,[0-6])*$/)
  daysOfWeek?: string;

  @IsOptional()
  active?: boolean;
}

export class LogHabitDto {
  // Dia do log em ISO (yyyy-mm-dd); default = hoje
  @IsString()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @IsOptional()
  done?: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  note?: string;
}

export const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
