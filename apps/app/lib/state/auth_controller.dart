import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/models.dart';
import '../services/api_client.dart';
import '../services/novamind_api.dart';

/// Estado de autenticação e ambiente ativo (pessoal vs. organização).
/// Persiste o token e a organização selecionada em shared_preferences —
/// funciona em web, iOS e Android.
class AuthController extends ChangeNotifier {
  static const _tokenKey = 'novamind.token';
  static const _orgKey = 'novamind.activeOrg';

  final ApiClient client = ApiClient();
  late final NovaMindApi api = NovaMindApi(client);

  User? user;
  String? activeOrgId;
  bool loading = true;

  bool get isLoggedIn => user != null;
  List<Organization> get organizations =>
      user?.members.map((m) => m.organization).toList() ?? [];

  Future<void> restore() async {
    final prefs = await SharedPreferences.getInstance();
    client.token = prefs.getString(_tokenKey);
    activeOrgId = prefs.getString(_orgKey);
    if (client.token != null) {
      try {
        user = await api.me();
      } on ApiException {
        await _clearSession();
      }
    }
    loading = false;
    notifyListeners();
  }

  Future<String?> login(String email, String password) async {
    try {
      final (token, u) = await api.login(email, password);
      await _saveSession(token);
      user = u;
      notifyListeners();
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }

  Future<String?> register(String name, String email, String password) async {
    try {
      final (token, u) = await api.register(name, email, password);
      await _saveSession(token);
      user = u;
      notifyListeners();
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }

  Future<void> logout() async {
    await _clearSession();
    user = null;
    activeOrgId = null;
    notifyListeners();
  }

  Future<void> setActiveOrg(String? orgId) async {
    activeOrgId = orgId;
    final prefs = await SharedPreferences.getInstance();
    if (orgId == null) {
      await prefs.remove(_orgKey);
    } else {
      await prefs.setString(_orgKey, orgId);
    }
    notifyListeners();
  }

  Future<void> _saveSession(String token) async {
    client.token = token;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_tokenKey, token);
  }

  Future<void> _clearSession() async {
    client.token = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
    await prefs.remove(_orgKey);
  }
}
