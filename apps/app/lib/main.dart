import 'package:flutter/material.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';

import 'state/auth_controller.dart';
import 'state/theme_controller.dart';
import 'ui/screens/home_shell.dart';
import 'ui/screens/login_screen.dart';

const _seed = Color(0xFF6366F1);

/// Estilo global dos cards: superfície translúcida ("vidro"), sombra
/// suave e cantos bem arredondados — aplicado a todos os Card do app.
CardThemeData _cardTheme(ColorScheme scheme, {required bool dark}) =>
    CardThemeData(
      clipBehavior: Clip.antiAlias,
      elevation: 4,
      shadowColor: dark
          ? Colors.black.withValues(alpha: 0.45)
          : scheme.shadow.withValues(alpha: 0.20),
      color:
          scheme.surfaceContainerHigh.withValues(alpha: dark ? 0.72 : 0.85),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
      ),
    );

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Necessário para o TableCalendar com locale pt_BR (tela de Agenda).
  await initializeDateFormatting('pt_BR');
  runApp(const NovaMindApp());
}

class NovaMindApp extends StatelessWidget {
  const NovaMindApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthController()..restore()),
        ChangeNotifierProvider(create: (_) => ThemeController()..restore()),
      ],
      child: Builder(
        builder: (context) {
          final lightScheme = ColorScheme.fromSeed(seedColor: _seed);
          final darkScheme = ColorScheme.fromSeed(
            seedColor: _seed,
            brightness: Brightness.dark,
          );
          return MaterialApp(
            title: 'NovaMind',
            debugShowCheckedModeBanner: false,
            themeMode: context.watch<ThemeController>().mode,
            theme: ThemeData(
              useMaterial3: true,
              colorScheme: lightScheme,
              cardTheme: _cardTheme(lightScheme, dark: false),
            ),
            darkTheme: ThemeData(
              useMaterial3: true,
              colorScheme: darkScheme,
              cardTheme: _cardTheme(darkScheme, dark: true),
              scaffoldBackgroundColor: const Color(0xFF0B0F17),
            ),
            home: const Root(),
          );
        },
      ),
    );
  }
}

class Root extends StatelessWidget {
  const Root({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    if (auth.loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (!auth.isLoggedIn) {
      return const LoginScreen();
    }
    return const HomeShell();
  }
}
