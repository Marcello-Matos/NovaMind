import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../services/api_client.dart';
import '../../state/auth_controller.dart';

class DocumentsScreen extends StatefulWidget {
  const DocumentsScreen({super.key});

  @override
  State<DocumentsScreen> createState() => _DocumentsScreenState();
}

class _DocumentsScreenState extends State<DocumentsScreen> {
  List<KnowledgeDocument> _docs = [];
  bool _uploading = false;
  String? _error;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _reload());
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _reload() async {
    final auth = context.read<AuthController>();
    try {
      final docs =
          await auth.api.listDocuments(organizationId: auth.activeOrgId);
      if (!mounted) return;
      setState(() => _docs = docs);
      // Acompanha o processamento em segundo plano até concluir.
      _poll?.cancel();
      if (docs.any((d) => d.isProcessing)) {
        _poll = Timer(const Duration(seconds: 3), _reload);
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<void> _upload() async {
    final auth = context.read<AuthController>();
    final file = await FilePicker.pickFile();
    if (file == null) return;
    final bytes = await file.readAsBytes();
    setState(() {
      _uploading = true;
      _error = null;
    });
    try {
      await auth.api.uploadDocument(
        bytes,
        file.name,
        organizationId: auth.activeOrgId,
      );
      _reload();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _delete(KnowledgeDocument d) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Excluir documento'),
        content: Text(
          'Excluir "${d.fileName}"? O assistente deixará de usar este conteúdo.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Excluir'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      await context.read<AuthController>().api.deleteDocument(d.id);
      _reload();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Widget _statusChip(KnowledgeDocument d, ThemeData theme) {
    final (label, color) = switch (d.status) {
      'READY' => ('Pronto', Colors.green),
      'FAILED' => ('Falhou', theme.colorScheme.error),
      _ => ('Processando…', Colors.amber),
    };
    return Chip(
      label: Text(label, style: TextStyle(fontSize: 11, color: color)),
      side: BorderSide(color: color.withValues(alpha: 0.5)),
      visualDensity: VisualDensity.compact,
    );
  }

  String _subtitle(KnowledgeDocument d) {
    final size = d.sizeBytes >= 1024 * 1024
        ? '${(d.sizeBytes / (1024 * 1024)).toStringAsFixed(1)} MB'
        : '${(d.sizeBytes / 1024).toStringAsFixed(0)} KB';
    if (d.status == 'FAILED') return d.error ?? 'Não foi possível processar.';
    if (d.status == 'READY' && d.chunks != null) {
      return '$size · ${d.chunks} trechos indexados';
    }
    if (d.isProcessing) return '$size · lendo e indexando o conteúdo…';
    return size;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 720),
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Base de conhecimento',
                  style: theme.textTheme.headlineSmall),
              const SizedBox(height: 4),
              Text(
                'Documentos usados pelo assistente como fonte de respostas. '
                'Formatos: PDF, DOCX, TXT, MD, CSV, JSON, HTML ou .zip (até 20 MB).',
                style: TextStyle(color: theme.hintColor),
              ),
              const SizedBox(height: 16),
              FilledButton.tonalIcon(
                onPressed: _uploading ? null : _upload,
                icon: const Icon(Icons.upload_file),
                label: Text(_uploading ? 'Enviando…' : 'Enviar documento'),
              ),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(_error!,
                      style: TextStyle(color: theme.colorScheme.error)),
                ),
              const SizedBox(height: 16),
              Expanded(
                child: _docs.isEmpty
                    ? Text('Nenhum documento enviado.',
                        style: TextStyle(color: theme.hintColor))
                    : RefreshIndicator(
                        onRefresh: _reload,
                        child: ListView.builder(
                          itemCount: _docs.length,
                          itemBuilder: (_, i) {
                            final d = _docs[i];
                            return ListTile(
                              contentPadding: EdgeInsets.zero,
                              leading: Icon(
                                d.status == 'FAILED'
                                    ? Icons.error_outline
                                    : Icons.description_outlined,
                                color: d.status == 'FAILED'
                                    ? theme.colorScheme.error
                                    : null,
                              ),
                              title: Text(d.fileName),
                              subtitle: Text(_subtitle(d)),
                              trailing: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  _statusChip(d, theme),
                                  IconButton(
                                    tooltip: 'Excluir',
                                    icon: const Icon(Icons.delete_outline),
                                    onPressed: () => _delete(d),
                                  ),
                                ],
                              ),
                            );
                          },
                        ),
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
