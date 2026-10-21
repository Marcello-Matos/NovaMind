import 'package:flutter/material.dart';

import '../../services/social_auth.dart';

/// Stub para plataformas não-web — o botão oficial do Google só existe
/// na web (ver `google_sign_in_button_web.dart`). Nunca exibido porque
/// os chamadores ramificam em `kIsWeb` antes de usá-lo.
class GoogleWebSignInButton extends StatelessWidget {
  final void Function(SocialCredential credential) onCredential;
  final void Function(String error)? onError;

  const GoogleWebSignInButton({
    super.key,
    required this.onCredential,
    this.onError,
  });

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}
