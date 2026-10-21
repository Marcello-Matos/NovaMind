import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../auth/auth.types';
import { GoogleCalendarService } from './google-calendar.service';

@Controller('integrations/google')
export class GoogleCalendarController {
  constructor(private readonly google: GoogleCalendarService) {}

  @Get('status')
  @UseGuards(JwtAuthGuard)
  status(@CurrentUser() user: AuthUser) {
    return this.google.status(user.id);
  }

  /** Aberto no navegador do app: ?token=<jwt> → 302 para o consentimento do Google. */
  @Get('authorize')
  authorize(@Query('token') token: string, @Res() res: Response) {
    const userId = this.google.verifyUserToken(token);
    return res.redirect(this.google.authorizeUrl(userId));
  }

  /** Público: o Google redireciona para cá com ?code&state. */
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const html = await this.google.handleCallback(code, state);
    res.type('html').send(html);
  }

  @Post('sync')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  sync(@CurrentUser() user: AuthUser) {
    return this.google.syncUser(user.id);
  }

  @Delete()
  @UseGuards(JwtAuthGuard)
  disconnect(@CurrentUser() user: AuthUser) {
    return this.google.disconnect(user.id);
  }
}
