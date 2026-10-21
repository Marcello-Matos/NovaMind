import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../services/api_client.dart';
import '../../state/auth_controller.dart';

class TasksScreen extends StatefulWidget {
  const TasksScreen({super.key});

  @override
  State<TasksScreen> createState() => _TasksScreenState();
}

class _TasksScreenState extends State<TasksScreen> {
  final _title = TextEditingController();
  List<TaskItem> _tasks = [];
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _reload());
  }

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  Future<void> _reload() async {
    final auth = context.read<AuthController>();
    try {
      final tasks =
          await auth.api.listTasks(organizationId: auth.activeOrgId);
      if (mounted) setState(() => _tasks = tasks);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<void> _create() async {
    final title = _title.text.trim();
    if (title.isEmpty) return;
    _title.clear();
    final auth = context.read<AuthController>();
    await auth.api.createTask({
      'title': title,
      if (auth.activeOrgId != null) 'organizationId': auth.activeOrgId,
    });
    _reload();
  }

  Future<void> _toggle(TaskItem task) async {
    await context.read<AuthController>().api.updateTask(task.id, {
      'status': task.isDone ? 'OPEN' : 'DONE',
    });
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
              Text('Tarefas', style: theme.textTheme.headlineSmall),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _title,
                      decoration: const InputDecoration(
                        hintText: 'Nova tarefa…',
                        border: OutlineInputBorder(),
                        isDense: true,
                      ),
                      onSubmitted: (_) => _create(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  FilledButton(onPressed: _create, child: const Text('Adicionar')),
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
                child: _tasks.isEmpty
                    ? Text(
                        'Nenhuma tarefa. Peça ao assistente no chat ou crie manualmente.',
                        style: TextStyle(color: theme.hintColor),
                      )
                    : ListView.builder(
                        itemCount: _tasks.length,
                        itemBuilder: (_, i) {
                          final t = _tasks[i];
                          return CheckboxListTile(
                            value: t.isDone,
                            onChanged: (_) => _toggle(t),
                            title: Text(
                              t.title,
                              style: TextStyle(
                                decoration: t.isDone
                                    ? TextDecoration.lineThrough
                                    : null,
                              ),
                            ),
                            subtitle: t.dueAt == null
                                ? null
                                : Text(
                                    'Vence em ${t.dueAt!.toLocal().toString().substring(0, 16)}'),
                            secondary: _PriorityBadge(priority: t.priority),
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

class _PriorityBadge extends StatelessWidget {
  final String priority;
  const _PriorityBadge({required this.priority});

  @override
  Widget build(BuildContext context) {
    final (label, color) = switch (priority) {
      'HIGH' => ('Alta', Colors.redAccent),
      'LOW' => ('Baixa', Colors.grey),
      _ => ('Média', Colors.amber),
    };
    return Chip(
      label: Text(label, style: const TextStyle(fontSize: 11)),
      side: BorderSide(color: color),
      visualDensity: VisualDensity.compact,
      padding: EdgeInsets.zero,
    );
  }
}
