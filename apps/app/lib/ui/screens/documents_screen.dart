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

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _reload());
  }

  Future<void> _reload() async {
    final auth = context.read<AuthController>();
    try {
      final docs =
          await auth.api.listDocuments(organizationId: auth.activeOrgId);
      if (mounted) setState(() => _docs = docs);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<void> _upload() async {
    final auth = context.read<AuthController>();
    final file = await FilePicker.pickFile();
    if (file == null) return;
    final bytes = await file.readAsBytes();
    setState(() => _uploading = true);
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
                'Documentos usados pelo assistente como fonte de respostas.',
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
                    : ListView.builder(
                        itemCount: _docs.length,
                        itemBuilder: (_, i) {
                          final d = _docs[i];
                          return ListTile(
                            leading: const Icon(Icons.description_outlined),
                            title: Text(d.fileName),
                            subtitle: Text(
                                '${(d.sizeBytes / 1024).toStringAsFixed(1)} KB · ${d.mimeType}'),
                            trailing: Chip(
                              label: Text(d.status,
                                  style: const TextStyle(fontSize: 11)),
                              visualDensity: VisualDensity.compact,
                            ),
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
