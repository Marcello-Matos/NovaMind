import 'package:flutter/material.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';

import 'state/auth_controller.dart';
import 'state/theme_controller.dart';
import 'ui/screens/home_shell.dart';
import 'ui/screens/login_screen.dart';

const _seed = Color(0xFF6366F1);

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
        builder: (context) => MaterialApp(
          title: 'NovaMind',
          debugShowCheckedModeBanner: false,
          themeMode: context.watch<ThemeController>().mode,
          theme: ThemeData(
            useMaterial3: true,
            colorScheme: ColorScheme.fromSeed(seedColor: _seed),
          ),
          darkTheme: ThemeData(
            useMaterial3: true,
            colorScheme: ColorScheme.fromSeed(
              seedColor: _seed,
              brightness: Brightness.dark,
            ),
            scaffoldBackgroundColor: const Color(0xFF0B0F17),
          ),
          home: const Root(),
        ),
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
