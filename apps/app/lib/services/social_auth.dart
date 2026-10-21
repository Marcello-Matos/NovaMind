import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

import '../config/env.dart';

/// Resultado de um sign-in social pronto para o backend.
class SocialCredential {
  final String idToken;
  final String? name;

  SocialCredential({required this.idToken, this.name});
}

/// Wrapper dos fluxos Google/Apple por plataforma.
///
/// - Google mobile/desktop: `authenticate()` do google_sign_in 7.x
/// - Google web: o SDK exige o botão oficial via `renderButton` — use
///   o `GoogleWebSignInButton` em `ui/widgets/google_sign_in_button.dart`
/// - Apple: `SignInWithApple.getAppleIDCredential` (nativo e web, este
///   último exigindo Service ID + redirect URI configurados)
class SocialAuthService {
  bool _googleInitialized = false;

  Future<void> _ensureGoogleInitialized() async {
    if (_googleInitialized) return;
    await GoogleSignIn.instance.initialize(
      clientId: Env.googleClientId.isEmpty ? null : Env.googleClientId,
    );
    _googleInitialized = true;
  }

  /// Fluxo Google para mobile/desktop. Retorna null se a plataforma
  /// exigir o botão web (use [GoogleWebSignInButton]) ou se o usuário
  /// cancelar.
  Future<SocialCredential?> signInWithGoogle() async {
    if (kIsWeb) return null;
    await _ensureGoogleInitialized();
    if (!GoogleSignIn.instance.supportsAuthenticate()) return null;
    try {
      final account = await GoogleSignIn.instance.authenticate();
      final idToken = account.authentication.idToken;
      if (idToken == null) return null;
      return SocialCredential(idToken: idToken);
    } on GoogleSignInException catch (e) {
      if (e.code == GoogleSignInExceptionCode.canceled) return null;
      rethrow;
    }
  }

  Future<SocialCredential?> signInWithApple() async {
    try {
      final credential = await SignInWithApple.getAppleIDCredential(
        scopes: [
          AppleIDAuthorizationScopes.email,
          AppleIDAuthorizationScopes.fullName,
        ],
        webAuthenticationOptions: kIsWeb && Env.appleServiceId.isNotEmpty
            ? WebAuthenticationOptions(
                clientId: Env.appleServiceId,
                redirectUri: Uri.parse(Env.appleRedirectUri),
              )
            : null,
      );
      if (credential.identityToken == null) return null;
      final givenName = credential.givenName ?? '';
      final familyName = credential.familyName ?? '';
      final name = '$givenName $familyName'.trim();
      return SocialCredential(
        idToken: credential.identityToken!,
        name: name.isEmpty ? null : name,
      );
    } on SignInWithAppleAuthorizationException catch (e) {
      if (e.code == AuthorizationErrorCode.canceled) return null;
      rethrow;
    }
  }

  Future<bool> get appleSupported => SignInWithApple.isAvailable();
}
