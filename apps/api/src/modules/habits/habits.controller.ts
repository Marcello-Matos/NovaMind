import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../auth/auth.types';
import {
  CreateHabitDto,
  LogHabitDto,
  UpdateHabitDto,
} from './dto/habit.dto';
import { HabitsService } from './habits.service';

@Controller('habits')
@UseGuards(JwtAuthGuard)
export class HabitsController {
  constructor(private readonly habits: HabitsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateHabitDto) {
    return this.habits.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.habits.list(user.id);
  }

  @Get('summary')
  summary(@CurrentUser() user: AuthUser) {
    return this.habits.summary(user.id);
  }

  @Post(':id/log')
  log(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: LogHabitDto,
  ) {
    return this.habits.log(user.id, id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateHabitDto,
  ) {
    return this.habits.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.habits.remove(user.id, id);
  }
}
