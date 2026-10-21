import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

import '../../config/env.dart';
import '../../services/social_auth.dart';
import '../../state/auth_controller.dart';
import 'google_brand_button.dart';
import 'google_sign_in_button.dart';

/// Botões "Continuar com Google" / "Continuar com Apple".
/// Na web, o Google usa o botão oficial renderizado pelo SDK
/// ([GoogleWebSignInButton]); a Apple só aparece se houver
/// Service ID configurado (ou em plataformas nativas).
class SocialLoginButtons extends StatefulWidget {
  const SocialLoginButtons({super.key});

  @override
  State<SocialLoginButtons> createState() => _SocialLoginButtonsState();
}

class _SocialLoginButtonsState extends State<SocialLoginButtons> {
  final _social = SocialAuthService();

  /// O entitlement "Sign in with Apple" exige conta paga da Apple
  /// (Personal Team não suporta). O botão só entra no build quando o
  /// entitlement é restaurado: --dart-define=APPLE_SIGNIN_ENABLED=true
  static const _appleEnabled = bool.fromEnvironment(
    'APPLE_SIGNIN_ENABLED',
    defaultValue: false,
  );

  bool _appleSupported = false;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _social.appleSupported.then((supported) {
      if (mounted) {
        setState(() => _appleSupported = _appleEnabled &&
            supported &&
            (!kIsWeb || Env.appleServiceId.isNotEmpty));
      }
    });
  }

  Future<void> _onCredential(
    SocialCredential credential,
    Future<String?> Function(String, {String? name}) login,
  ) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final error = await login(credential.idToken, name: credential.name);
    if (mounted) {
      setState(() {
        _busy = false;
        _error = error;
      });
    }
  }

  Future<void> _google() async {
    try {
      final credential = await _social.signInWithGoogle();
      if (credential == null) return; // cancelado
      await _onCredential(
        credential,
        (token, {name}) =>
            context.read<AuthController>().loginWithGoogle(token),
      );
    } catch (e) {
      setState(() => _error = 'Falha no login Google: $e');
    }
  }

  Future<void> _apple() async {
    try {
      final credential = await _social.signInWithApple();
      if (credential == null) return;
      await _onCredential(
        credential,
        (token, {name}) => context
            .read<AuthController>()
            .loginWithApple(token, name: name),
      );
    } catch (e) {
      setState(() => _error = 'Falha no login Apple: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Row(
          children: [
            Expanded(child: Divider()),
            Padding(
              padding: EdgeInsets.symmetric(horizontal: 12),
              child: Text('ou'),
            ),
            Expanded(child: Divider()),
          ],
        ),
        const SizedBox(height: 16),
        if (kIsWeb)
          GoogleWebSignInButton(
            onCredential: (c) => _onCredential(
              c,
              (token, {name}) =>
                  context.read<AuthController>().loginWithGoogle(token),
            ),
            onError: (e) => setState(() => _error = e),
          )
        else
          GoogleBrandButton(onPressed: _busy ? null : _google),
        if (_appleSupported) ...[
          const SizedBox(height: 10),
          SizedBox(
            height: 44,
            child: SignInWithAppleButton(
              onPressed: _busy ? () {} : _apple,
              style: SignInWithAppleButtonStyle.whiteOutlined,
              text: 'Continuar com Apple',
            ),
          ),
        ],
        if (_error != null) ...[
          const SizedBox(height: 10),
          Text(
            _error!,
            style: TextStyle(color: Theme.of(context).colorScheme.error),
            textAlign: TextAlign.center,
          ),
        ],
      ],
    );
  }
}
