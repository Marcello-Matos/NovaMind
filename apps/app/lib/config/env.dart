/// Configuração de ambiente do app.
/// Sobrescreva em tempo de execução:
///   flutter run --dart-define=API_URL=http://localhost:3001
class Env {
  static const apiUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'http://localhost:3001',
  );
}
