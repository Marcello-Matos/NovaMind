import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../services/api_client.dart';
import '../../state/auth_controller.dart';

/// Ações de edição/exclusão de documentos da base de conhecimento,
/// compartilhadas entre a lista e a tela de detalhes. Cada uma retorna
/// true quando algo mudou (a tela chamadora recarrega).
class DocumentActions {
  static void _snack(BuildContext context, String message) =>
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(message)));

  static String _baseName(String fileName) {
    final dot = fileName.lastIndexOf('.');
    return dot > 0 ? fileName.substring(0, dot) : fileName;
  }

  static Future<bool> rename(BuildContext context, KnowledgeDocument d) async {
    final api = context.read<AuthController>().api;
    final controller = TextEditingController(text: _baseName(d.fileName));
    final name = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Renomear documento'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(
            labelText: 'Nome',
            helperText: 'A extensão do arquivo é mantida',
          ),
          onSubmitted: (v) => Navigator.pop(context, v.trim()),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, controller.text.trim()),
            child: const Text('Salvar'),
          ),
        ],
      ),
    );
    if (name == null || name.isEmpty || !context.mounted) return false;
    try {
      await api.renameDocument(d.id, name);
      if (context.mounted) _snack(context, 'Documento renomeado');
      return true;
    } on ApiException catch (e) {
      if (context.mounted) _snack(context, e.message);
      return false;
    }
  }

  static Future<bool> replace(BuildContext context, KnowledgeDocument d) async {
    final api = context.read<AuthController>().api;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Substituir arquivo'),
        content: Text(
          'Escolha um novo arquivo para "${d.fileName}". O conteúdo atual '
          'será substituído e reindexado.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Escolher arquivo'),
          ),
        ],
      ),
    );
    if (confirmed != true) return false;
    final file = await FilePicker.pickFile();
    if (file == null || !context.mounted) return false;
    final bytes = await file.readAsBytes();
    try {
      await api.replaceDocument(d.id, bytes, file.name);
      if (context.mounted) {
        _snack(context, 'Arquivo substituído — reprocessando o conteúdo…');
      }
      return true;
    } on ApiException catch (e) {
      if (context.mounted) _snack(context, e.message);
      return false;
    }
  }

  static Future<bool> delete(BuildContext context, KnowledgeDocument d) async {
    final api = context.read<AuthController>().api;
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Excluir documento'),
        content: Text(
          'Excluir "${d.fileName}"? O assistente deixará de usar este '
          'conteúdo. Essa ação não pode ser desfeita.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(context).colorScheme.error,
            ),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Excluir'),
          ),
        ],
      ),
    );
    if (ok != true || !context.mounted) return false;
    try {
      await api.deleteDocument(d.id);
      if (context.mounted) _snack(context, 'Documento excluído');
      return true;
    } on ApiException catch (e) {
      if (context.mounted) _snack(context, e.message);
      return false;
    }
  }
}
