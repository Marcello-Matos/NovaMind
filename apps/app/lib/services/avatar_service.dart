import 'dart:convert';
import 'dart:io';

import 'package:image/image.dart' as img;
import 'package:image_picker/image_picker.dart';

/// Escolha e processamento da foto de perfil.
///
/// A imagem é cortada no centro (quadrado), redimensionada para 256x256
/// e comprimida em JPEG ~85 antes do upload — o upload fica em torno de
/// 10-30KB independente do tamanho da foto original.
class AvatarService {
  static const _side = 256;

  final _picker = ImagePicker();

  /// Abre a galeria, processa a imagem e devolve o data URL pronto
  /// para salvar em `avatarUrl`. Retorna null se o usuário cancelar.
  Future<String?> pickAndProcess() async {
    final picked = await _picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 90,
    );
    if (picked == null) return null;
    return processFile(File(picked.path));
  }

  /// Mesmo fluxo da câmera.
  Future<String?> shootAndProcess() async {
    final picked = await _picker.pickImage(
      source: ImageSource.camera,
      imageQuality: 90,
    );
    if (picked == null) return null;
    return processFile(File(picked.path));
  }

  Future<String> processFile(File file) async {
    final bytes = await file.readAsBytes();
    var decoded = img.decodeImage(bytes);
    if (decoded == null) {
      throw const FormatException('Arquivo de imagem inválido');
    }

    // Corte central quadrado
    final side = decoded.width < decoded.height
        ? decoded.width
        : decoded.height;
    final offsetX = (decoded.width - side) ~/ 2;
    final offsetY = (decoded.height - side) ~/ 2;
    decoded = img.copyCrop(
      decoded,
      x: offsetX,
      y: offsetY,
      width: side,
      height: side,
    );

    // Redimensiona para o tamanho final e comprime
    final resized = img.copyResize(decoded, width: _side, height: _side);
    final jpeg = img.encodeJpg(resized, quality: 85);
    return 'data:image/jpeg;base64,${base64Encode(jpeg)}';
  }
}
