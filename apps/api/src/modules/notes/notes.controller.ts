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
import { CreateNoteDto, UpdateNoteDto } from './dto/note.dto';
import { NotesService } from './notes.service';

@Controller('notes')
@UseGuards(JwtAuthGuard)
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateNoteDto) {
    return this.notes.create(user.id, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId?: string,
    @Query('search') search?: string,
  ) {
    return this.notes.list(user.id, organizationId, search);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateNoteDto,
  ) {
    return this.notes.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notes.remove(user.id, id);
  }
}
