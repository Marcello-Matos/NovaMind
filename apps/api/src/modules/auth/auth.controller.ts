import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import { AuthUser } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { AppleLoginDto, GoogleLoginDto } from './dto/oauth.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { OauthService } from './oauth.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly oauth: OauthService,
  ) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('google')
  async google(@Body() dto: GoogleLoginDto) {
    const identity = await this.oauth.verifyGoogle(dto.idToken);
    const user = await this.oauth.findOrCreateUser(identity);
    return this.auth.loginResponseFor(
      user.id,
      user.email,
      user.name,
      user.avatarUrl,
    );
  }

  @Post('apple')
  async apple(@Body() dto: AppleLoginDto) {
    const identity = await this.oauth.verifyApple(dto.identityToken, dto.name);
    const user = await this.oauth.findOrCreateUser(identity);
    return this.auth.loginResponseFor(
      user.id,
      user.email,
      user.name,
      user.avatarUrl,
    );
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto) {
    return this.auth.updateMe(user.id, dto);
  }
}
