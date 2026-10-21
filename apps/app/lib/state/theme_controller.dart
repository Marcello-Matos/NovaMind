import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Controle do tema claro/escuro, persistido entre sessões.
class ThemeController extends ChangeNotifier {
  static const _key = 'theme_mode';

  ThemeMode _mode = ThemeMode.dark;
  ThemeMode get mode => _mode;
  bool get isDark => _mode == ThemeMode.dark;

  Future<void> restore() async {
    final prefs = await SharedPreferences.getInstance();
    _mode = prefs.getString(_key) == 'light' ? ThemeMode.light : ThemeMode.dark;
    notifyListeners();
  }

  Future<void> toggle() async {
    _mode = isDark ? ThemeMode.light : ThemeMode.dark;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, isDark ? 'dark' : 'light');
  }
}
