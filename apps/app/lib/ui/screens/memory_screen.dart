import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../services/api_client.dart';
import '../../state/auth_controller.dart';

class MemoryScreen extends StatefulWidget {
  const MemoryScreen({super.key});

  @override
  State<MemoryScreen> createState() => _MemoryScreenState();
}

class _MemoryScreenState extends State<MemoryScreen> {
  final _key = TextEditingController();
  final _value = TextEditingController();
  List<MemoryEntry> _memories = [];
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _reload());
  }

  @override
  void dispose() {
    _key.dispose();
    _value.dispose();
    super.dispose();
  }

  Future<void> _reload() async {
    try {
      final list = await context.read<AuthController>().api.listMemories();
      if (mounted) setState(() => _memories = list);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<void> _create() async {
    if (_key.text.trim().isEmpty || _value.text.trim().isEmpty) return;
    await context
        .read<AuthController>()
        .api
        .createMemory(_key.text.trim(), _value.text.trim());
    _key.clear();
    _value.clear();
    _reload();
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
              Text('Memória controlável',
                  style: theme.textTheme.headlineSmall),
              const SizedBox(height: 4),
              Text(
                'O assistente só usa os fatos ativados abaixo. Você pode corrigir, desativar ou excluir qualquer um.',
                style: TextStyle(color: theme.hintColor),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  SizedBox(
                    width: 180,
                    child: TextField(
                      controller: _key,
                      decoration: const InputDecoration(
                        hintText: 'Chave',
                        border: OutlineInputBorder(),
                        isDense: true,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextField(
                      controller: _value,
                      decoration: const InputDecoration(
                        hintText: 'Valor',
                        border: OutlineInputBorder(),
                        isDense: true,
                      ),
                      onSubmitted: (_) => _create(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  FilledButton(onPressed: _create, child: const Text('Guardar')),
                ],
              ),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(_error!,
                      style: TextStyle(color: theme.colorScheme.error)),
                ),
              const SizedBox(height: 16),
              Expanded(
                child: _memories.isEmpty
                    ? Text('Nenhum fato memorizado ainda.',
                        style: TextStyle(color: theme.hintColor))
                    : ListView.builder(
                        itemCount: _memories.length,
                        itemBuilder: (_, i) {
                          final m = _memories[i];
                          return ListTile(
                            title: Text(m.key),
                            subtitle: Text(m.value),
                            leading: Switch(
                              value: m.enabled,
                              onChanged: (_) async {
                                await context
                                    .read<AuthController>()
                                    .api
                                    .updateMemory(
                                        m.id, {'enabled': !m.enabled});
                                _reload();
                              },
                            ),
                            trailing: IconButton(
                              icon: const Icon(Icons.delete_outline),
                              onPressed: () async {
                                await context
                                    .read<AuthController>()
                                    .api
                                    .deleteMemory(m.id);
                                _reload();
                              },
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
