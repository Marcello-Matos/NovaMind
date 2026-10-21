/// Configuração de ambiente do app.
/// Sobrescreva em tempo de execução:
///   flutter run --dart-define=API_URL=http://localhost:3001 \
///     --dart-define=GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
class Env {
  static const apiUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'http://localhost:3001',
  );

  /// Web Client ID do Google (Google Cloud Console → Credentials).
  /// Em iOS/Android, o clientId nativo é configurado nos arquivos da
  /// plataforma (Info.plist / strings.xml) — este valor cobre web e
  /// serve de fallback.
  static const googleClientId = String.fromEnvironment(
    'GOOGLE_CLIENT_ID',
    defaultValue: '',
  );

  /// Sign in with Apple na web exige Service ID + return URL configurados
  /// no Apple Developer. No iOS/Android nativo não é necessário.
  static const appleServiceId = String.fromEnvironment(
    'APPLE_SERVICE_ID',
    defaultValue: '',
  );
  static const appleRedirectUri = String.fromEnvironment(
    'APPLE_REDIRECT_URI',
    defaultValue: '',
  );
}
