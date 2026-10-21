import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/env.dart';

class ApiException implements Exception {
  final int status;
  final String message;
  ApiException(this.status, this.message);

  @override
  String toString() => message;
}

/// Cliente HTTP da API NovaMind (`/v1`). Injeta o Bearer token salvo
/// em [token] e traduz erros em [ApiException] com a mensagem do backend.
class ApiClient {
  String? token;

  Uri _uri(String path, [Map<String, String>? query]) =>
      Uri.parse('${Env.apiUrl}/v1$path').replace(queryParameters: query);

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      };

  Future<dynamic> _send(
    String method,
    String path, {
    Object? body,
    Map<String, String>? query,
  }) async {
    final request = http.Request(method, _uri(path, query));
    request.headers.addAll(_headers);
    if (body != null) request.body = jsonEncode(body);
    final response = await http.Response.fromStream(await request.send());
    if (response.statusCode >= 400) {
      String message = 'Erro ${response.statusCode}';
      try {
        final decoded = jsonDecode(response.body);
        if (decoded is Map && decoded['message'] != null) {
          final m = decoded['message'];
          message = m is List ? m.join(', ') : m.toString();
        }
      } catch (_) {}
      throw ApiException(response.statusCode, message);
    }
    if (response.body.isEmpty) return null;
    return jsonDecode(response.body);
  }

  Future<dynamic> get(String path, [Map<String, String>? query]) =>
      _send('GET', path, query: query);

  Future<dynamic> post(String path, [Object? body, Map<String, String>? query]) =>
      _send('POST', path, body: body, query: query);

  Future<dynamic> patch(String path, Object body) => _send('PATCH', path, body: body);

  Future<dynamic> delete(String path) => _send('DELETE', path);

  /// Upload multipart (base de conhecimento).
  Future<dynamic> uploadFile(
    String path,
    List<int> bytes,
    String fileName, {
    Map<String, String>? query,
  }) async {
    final request = http.MultipartRequest('POST', _uri(path, query));
    request.headers.addAll({
      if (token != null) 'Authorization': 'Bearer $token',
    });
    request.files.add(
      http.MultipartFile.fromBytes('file', bytes, filename: fileName),
    );
    final response = await http.Response.fromStream(await request.send());
    if (response.statusCode >= 400) {
      throw ApiException(response.statusCode, 'Falha no upload');
    }
    return jsonDecode(response.body);
  }
}
