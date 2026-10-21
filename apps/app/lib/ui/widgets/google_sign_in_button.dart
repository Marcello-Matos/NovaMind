// Exportação condicional do botão Google da web.
//
// `google_sign_in_web` depende de `dart:ui_web`/`dart:js_interop`, que
// só existem na compilação web — importá-lo no nativo quebra build e
// testes. Por isso o widget real fica atrás desta barreira.
export 'google_sign_in_button_stub.dart'
    if (dart.library.js_interop) 'google_sign_in_button_web.dart';
