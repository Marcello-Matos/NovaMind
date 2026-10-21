import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../services/api_client.dart';
import '../../services/novamind_api.dart';
import '../../state/auth_controller.dart';

/// Hábitos e Anotações em uma tela (aba 7): seletor no topo.
/// Hábitos são pessoais; anotações seguem o modo ativo (pessoal ou empresa).
class HabitsNotesScreen extends StatefulWidget {
  const HabitsNotesScreen({super.key});

  @override
  State<HabitsNotesScreen> createState() => _HabitsNotesScreenState();
}

class _HabitsNotesScreenState extends State<HabitsNotesScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tab = TabController(length: 2, vsync: this);

  NovaMindApi get api => context.read<AuthController>().api;

  List<Habit> _habits = [];
  List<NoteItem> _notes = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final habits = await api.listHabits();
      final notes = await api.listNotes();
      if (!mounted) return;
      setState(() {
        _habits = habits;
        _notes = notes;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    }
  }

  Future<void> _newHabit() async {
    final name = TextEditingController();
    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Novo hábito'),
        content: TextField(
          controller: name,
          autofocus: true,
          decoration: const InputDecoration(
            labelText: 'Nome (ex.: Beber 2L de água)',
            prefixIcon: Icon(Icons.repeat_outlined),
          ),
          onSubmitted: (_) => Navigator.pop(context, true),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () =>
                name.text.trim().isEmpty ? null : Navigator.pop(context, true),
            child: const Text('Criar'),
          ),
        ],
      ),
    );
    if (saved == true) {
      await api.createHabit(name.text.trim());
      _load();
    }
  }

  Future<void> _newNote() async {
    final title = TextEditingController();
    final content = TextEditingController();
    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Nova anotação'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: title,
              autofocus: true,
              decoration: const InputDecoration(labelText: 'Título'),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: content,
              maxLines: 5,
              decoration: const InputDecoration(
                labelText: 'Anotação',
                alignLabelWithHint: true,
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => title.text.trim().isEmpty ||
                    content.text.trim().isEmpty
                ? null
                : Navigator.pop(context, true),
            child: const Text('Salvar'),
          ),
        ],
      ),
    );
    if (saved == true) {
      await api.createNote(
        title: title.text.trim(),
        content: content.text.trim(),
      );
      _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Hábitos e Anotações'),
        bottom: TabBar(
          controller: _tab,
          tabs: const [
            Tab(icon: Icon(Icons.repeat_outlined), text: 'Hábitos'),
            Tab(icon: Icon(Icons.sticky_note_2_outlined), text: 'Anotações'),
          ],
        ),
        actions: [
          IconButton(
            icon: Icon(_tab.index == 0 ? Icons.add : Icons.post_add_outlined),
            tooltip: _tab.index == 0 ? 'Novo hábito' : 'Nova anotação',
            onPressed: _tab.index == 0 ? _newHabit : _newNote,
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _tab.index == 0 ? _newHabit : _newNote,
        icon: const Icon(Icons.add),
        label: Text(_tab.index == 0 ? 'Hábito' : 'Anotação'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Text(_error!,
                      style: TextStyle(color: theme.colorScheme.error)))
              : TabBarView(
                  controller: _tab,
                  children: [
                    _habitsList(theme),
                    _notesList(theme),
                  ],
                ),
    );
  }

  Widget _habitsList(ThemeData theme) {
    if (_habits.isEmpty) {
      return const Center(
        child: Text(
          'Nenhum hábito ainda.\nCrie o primeiro com o botão abaixo.',
          textAlign: TextAlign.center,
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.only(bottom: 96),
        children: [
          for (final h in _habits)
            CheckboxListTile(
              value: h.doneToday,
              onChanged: (_) async {
                await api.toggleHabitToday(h.id, done: !h.doneToday);
                _load();
              },
              title: Text(h.name),
              secondary: IconButton(
                icon: const Icon(Icons.delete_outline),
                onPressed: () async {
                  await api.deleteHabit(h.id);
                  _load();
                },
              ),
            ),
        ],
      ),
    );
  }

  Widget _notesList(ThemeData theme) {
    if (_notes.isEmpty) {
      return const Center(
        child: Text(
          'Nenhuma anotação ainda.\nCrie a primeira com o botão abaixo.',
          textAlign: TextAlign.center,
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.only(bottom: 96),
        children: [
          for (final n in _notes)
            ListTile(
              leading: const Icon(Icons.sticky_note_2_outlined),
              title: Text(n.title),
              subtitle: Text(
                n.content,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              trailing: IconButton(
                icon: const Icon(Icons.delete_outline),
                onPressed: () async {
                  await api.deleteNote(n.id);
                  _load();
                },
              ),
            ),
        ],
      ),
    );
  }
}
