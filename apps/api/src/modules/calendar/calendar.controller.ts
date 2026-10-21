import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../auth/auth.types';
import {
  CreateCalendarEventDto,
  UpdateCalendarEventDto,
} from './dto/calendar.dto';
import { CalendarService } from './calendar.service';

@Controller('calendar')
@UseGuards(JwtAuthGuard)
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCalendarEventDto) {
    return this.calendar.create(user.id, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('organizationId') organizationId?: string,
  ) {
    const now = new Date();
    const start = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = to
      ? new Date(to)
      : new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return this.calendar.list(user.id, start, end, organizationId);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCalendarEventDto,
  ) {
    return this.calendar.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.calendar.remove(user.id, id);
  }
}
