import 'dart:async';

import 'package:flutter/material.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:google_sign_in_platform_interface/google_sign_in_platform_interface.dart';
import 'package:google_sign_in_web/google_sign_in_web.dart';

import '../../config/env.dart';
import '../../services/social_auth.dart';
import 'google_brand_button.dart';

/// Botão oficial de Sign in with Google para **web** — o GIS exige o
/// botão renderizado pelo SDK (não aceita `authenticate()` no browser).
/// Em mobile/desktop use [SocialAuthService.signInWithGoogle].
///
/// Importado via conditional export em `google_sign_in_button.dart` —
/// nunca importe este arquivo diretamente (usa dart:ui_web).
class GoogleWebSignInButton extends StatefulWidget {
  final void Function(SocialCredential credential) onCredential;
  final void Function(String error)? onError;

  const GoogleWebSignInButton({
    super.key,
    required this.onCredential,
    this.onError,
  });

  @override
  State<GoogleWebSignInButton> createState() => _GoogleWebSignInButtonState();
}

class _GoogleWebSignInButtonState extends State<GoogleWebSignInButton> {
  bool _ready = false;
  bool _failed = false;
  StreamSubscription<GoogleSignInAuthenticationEvent>? _sub;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    if (Env.googleClientId.isEmpty) {
      setState(() => _failed = true);
      return;
    }
    try {
      await GoogleSignIn.instance.initialize(clientId: Env.googleClientId);
      _sub = GoogleSignIn.instance.authenticationEvents.listen((event) {
        if (event is GoogleSignInAuthenticationEventSignIn) {
          final idToken = event.user.authentication.idToken;
          if (idToken != null) {
            widget.onCredential(SocialCredential(idToken: idToken));
          }
        }
      }, onError: (Object e) => widget.onError?.call(e.toString()));
      if (mounted) setState(() => _ready = true);
    } catch (e) {
      widget.onError?.call(e.toString());
      if (mounted) setState(() => _failed = true);
    }
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Sem Client ID ou falha no SDK: mostra o botão da marca desabilitado
    // em vez de um spinner infinito — o usuário vê que a opção existe.
    if (_failed) {
      return const GoogleBrandButton(onPressed: null);
    }
    if (!_ready) {
      return const GoogleBrandButton(onPressed: null);
    }
    return SizedBox(
      height: 44,
      child: (GoogleSignInPlatform.instance as GoogleSignInPlugin)
          .renderButton(),
    );
  }
}
