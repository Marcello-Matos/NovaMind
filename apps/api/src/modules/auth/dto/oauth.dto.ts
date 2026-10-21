import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class GoogleLoginDto {
  /** ID token emitido pelo Google Sign-In no app. */
  @IsString()
  @IsNotEmpty()
  idToken!: string;
}

export class AppleLoginDto {
  /** Identity token (JWT) emitido pelo Sign in with Apple no app. */
  @IsString()
  @IsNotEmpty()
  identityToken!: string;

  /**
   * Nome completo — a Apple só envia na primeira autorização.
   * Se omitido, deriva-se do e-mail.
   */
  @IsString()
  @IsOptional()
  name?: string;
}
