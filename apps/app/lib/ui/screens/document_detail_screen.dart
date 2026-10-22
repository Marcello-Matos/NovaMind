import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../services/api_client.dart';
import '../../state/auth_controller.dart';
import '../widgets/document_actions.dart';

/// Detalhes de um documento: metadados, conteúdo indexado (o que a IA lê)
/// e ações de renomear, substituir e excluir.
class DocumentDetailScreen extends StatefulWidget {
  final String documentId;

  const DocumentDetailScreen({super.key, required this.documentId});

  @override
  State<DocumentDetailScreen> createState() => _DocumentDetailScreenState();
}

class _DocumentDetailScreenState extends State<DocumentDetailScreen> {
  KnowledgeDocumentDetail? _detail;
  final List<DocumentChunkPreview> _chunks = [];
  bool _loading = true;
  bool _loadingMore = false;
  bool _changed = false;
  String? _error;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    final api = context.read<AuthController>().api;
    try {
      final detail = await api.getDocument(widget.documentId);
      if (!mounted) return;
      setState(() {
        _detail = detail;
        _chunks
          ..clear()
          ..addAll(detail.chunks);
        _loading = false;
        _error = null;
      });
      _poll?.cancel();
      if (detail.document.isProcessing) {
        _poll = Timer(const Duration(seconds: 3), _load);
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _error = e.message;
          _loading = false;
        });
      }
    }
  }

  Future<void> _loadMore() async {
    final api = context.read<AuthController>().api;
    setState(() => _loadingMore = true);
    try {
      final more =
          await api.getDocument(widget.documentId, offset: _chunks.length);
      if (mounted) setState(() => _chunks.addAll(more.chunks));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  Future<void> _run(Future<bool> Function() action, {bool closes = false}) async {
    if (!await action() || !mounted) return;
    _changed = true;
    if (closes) {
      Navigator.of(context).pop(true);
    } else {
      setState(() => _loading = true);
      _load();
    }
  }

  String _fmtDate(DateTime d) {
    final l = d.toLocal();
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(l.day)}/${two(l.month)}/${l.year} ${two(l.hour)}:${two(l.minute)}';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final detail = _detail;
    final doc = detail?.document;
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) Navigator.of(context).pop(_changed);
      },
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Documento'),
          actions: doc == null
              ? null
              : [
                  IconButton(
                    tooltip: 'Renomear',
                    icon: const Icon(Icons.edit_outlined),
                    onPressed: () =>
                        _run(() => DocumentActions.rename(context, doc)),
                  ),
                  IconButton(
                    tooltip: 'Substituir arquivo',
                    icon: const Icon(Icons.upload_file_outlined),
                    onPressed: doc.isProcessing
                        ? null
                        : () =>
                            _run(() => DocumentActions.replace(context, doc)),
                  ),
                  IconButton(
                    tooltip: 'Excluir',
                    icon: const Icon(Icons.delete_outline),
                    onPressed: () => _run(
                      () => DocumentActions.delete(context, doc),
                      closes: true,
                    ),
                  ),
                ],
        ),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : doc == null
                ? Center(
                    child: Text(_error ?? 'Documento não encontrado',
                        style: TextStyle(color: theme.colorScheme.error)),
                  )
                : ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      Text(doc.fileName, style: theme.textTheme.titleLarge),
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          _info(Icons.info_outline, switch (doc.status) {
                            'READY' => 'Pronto',
                            'FAILED' => 'Falhou',
                            _ => 'Processando…',
                          }),
                          _info(
                            Icons.storage_outlined,
                            doc.sizeBytes >= 1024 * 1024
                                ? '${(doc.sizeBytes / (1024 * 1024)).toStringAsFixed(1)} MB'
                                : '${(doc.sizeBytes / 1024).toStringAsFixed(0)} KB',
                          ),
                          _info(Icons.segment, '${detail!.chunkCount} trechos'),
                          _info(Icons.schedule,
                              'Enviado em ${_fmtDate(detail.createdAt)}'),
                        ],
                      ),
                      if (doc.status == 'FAILED' && doc.error != null) ...[
                        const SizedBox(height: 12),
                        Text(doc.error!,
                            style: TextStyle(color: theme.colorScheme.error)),
                      ],
                      const SizedBox(height: 20),
                      Text('Conteúdo indexado',
                          style: theme.textTheme.titleMedium),
                      Text(
                        'É este texto que o assistente consulta para responder.',
                        style: theme.textTheme.bodySmall
                            ?.copyWith(color: theme.hintColor),
                      ),
                      const SizedBox(height: 8),
                      if (_chunks.isEmpty)
                        Text(
                          doc.isProcessing
                              ? 'Lendo e indexando o conteúdo…'
                              : 'Nenhum conteúdo indexado.',
                          style: TextStyle(color: theme.hintColor),
                        ),
                      ..._chunks.map(
                        (c) => Card(
                          margin: const EdgeInsets.only(bottom: 8),
                          child: Padding(
                            padding: const EdgeInsets.all(12),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  [
                                    'Trecho ${c.index + 1}',
                                    if (c.page != null) 'página ${c.page}',
                                    if (c.file != null && c.file != doc.fileName)
                                      c.file!,
                                  ].join(' · '),
                                  style: theme.textTheme.labelSmall
                                      ?.copyWith(color: theme.hintColor),
                                ),
                                const SizedBox(height: 6),
                                SelectableText(c.content),
                              ],
                            ),
                          ),
                        ),
                      ),
                      if (_chunks.length < detail.chunkCount)
                        Center(
                          child: TextButton(
                            onPressed: _loadingMore ? null : _loadMore,
                            child: Text(_loadingMore
                                ? 'Carregando…'
                                : 'Carregar mais (${detail.chunkCount - _chunks.length} restantes)'),
                          ),
                        ),
                    ],
                  ),
      ),
    );
  }

  Widget _info(IconData icon, String label) => Chip(
        avatar: Icon(icon, size: 16),
        label: Text(label, style: const TextStyle(fontSize: 12)),
        visualDensity: VisualDensity.compact,
      );
}
