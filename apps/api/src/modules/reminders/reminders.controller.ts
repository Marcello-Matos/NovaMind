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
  CreateReminderDto,
  UpdateReminderDto,
} from './dto/reminder.dto';
import { RemindersService } from './reminders.service';

@Controller('reminders')
@UseGuards(JwtAuthGuard)
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateReminderDto) {
    return this.reminders.create(user.id, dto);
  }

  @Get()
  upcoming(@CurrentUser() user: AuthUser) {
    return this.reminders.upcoming(user.id);
  }

  @Get('due')
  due(@CurrentUser() user: AuthUser) {
    return this.reminders.due(user.id);
  }

  @Post(':id/ack')
  ack(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.reminders.ack(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateReminderDto,
  ) {
    return this.reminders.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.reminders.remove(user.id, id);
  }
}
