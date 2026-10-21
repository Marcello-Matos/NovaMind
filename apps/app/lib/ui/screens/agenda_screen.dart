import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:table_calendar/table_calendar.dart';

import '../../models/models.dart';
import '../../services/api_client.dart';
import '../../services/novamind_api.dart';
import '../../state/auth_controller.dart';

/// Agenda de compromissos: calendário mensal + lista do dia + lembretes.
/// Compromissos criados no modo empresarial ficam visíveis à equipe.
class AgendaScreen extends StatefulWidget {
  const AgendaScreen({super.key});

  @override
  State<AgendaScreen> createState() => _AgendaScreenState();
}

class _AgendaScreenState extends State<AgendaScreen> {
  NovaMindApi get api => context.read<AuthController>().api;
  DateTime _focusedDay = DateTime.now();
  DateTime _selectedDay = DateTime.now();
  List<CalendarEventItem> _events = [];
  List<ReminderItem> _reminders = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final auth = context.read<AuthController>();
    final org = auth.activeOrgId;
    final api = auth.api;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final monthStart = DateTime(_focusedDay.year, _focusedDay.month, 1);
      final monthEnd = DateTime(_focusedDay.year, _focusedDay.month + 1, 1);
      final results = await Future.wait([
        api.listEvents(
          from: monthStart,
          to: monthEnd,
          organizationId: org,
        ),
        api.listReminders(),
      ]);
      if (!mounted) return;
      setState(() {
        _events = results[0] as List<CalendarEventItem>;
        _reminders = results[1] as List<ReminderItem>;
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

  Future<void> _newEvent() async {
    final api = this.api;
    final orgId = context.read<AuthController>().activeOrgId;
    final title = TextEditingController();
    final time = TimeOfDay.now();
    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Novo compromisso'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: title,
              autofocus: true,
              decoration: const InputDecoration(
                labelText: 'Título',
                prefixIcon: Icon(Icons.event_outlined),
              ),
              onSubmitted: (_) => Navigator.pop(context, true),
            ),
            const SizedBox(height: 8),
            Text(
              '${_selectedDay.day}/${_selectedDay.month}/${_selectedDay.year} às ${time.format(context)}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () =>
                title.text.trim().isEmpty ? null : Navigator.pop(context, true),
            child: const Text('Salvar'),
          ),
        ],
      ),
    );
    if (saved != true) return;
    final start = DateTime(
      _selectedDay.year,
      _selectedDay.month,
      _selectedDay.day,
      time.hour,
      time.minute,
    );
    try {
      await api.createEvent(
        title: title.text.trim(),
        startsAt: start,
        organizationId: orgId,
      );
      await _load();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final dayEvents = _events
        .where((e) =>
            e.startsAt.year == _selectedDay.year &&
            e.startsAt.month == _selectedDay.month &&
            e.startsAt.day == _selectedDay.day)
        .toList();
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Agenda'),
        actions: [
          IconButton(
            tooltip: 'Atualizar',
            icon: const Icon(Icons.refresh),
            onPressed: _load,
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _newEvent,
        icon: const Icon(Icons.add),
        label: const Text('Compromisso'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Text(_error!,
                      style: TextStyle(color: theme.colorScheme.error)))
              : ListView(
                  padding: const EdgeInsets.only(bottom: 96),
                  children: [
                    TableCalendar(
                      firstDay: DateTime.utc(2020, 1, 1),
                      lastDay: DateTime.utc(2100, 12, 31),
                      focusedDay: _focusedDay,
                      selectedDayPredicate: (d) => _sameDay(d, _selectedDay),
                      onPageChanged: (d) {
                        _focusedDay = d;
                        _load();
                      },
                      onDaySelected: (selected, focused) {
                        setState(() {
                          _selectedDay = selected;
                          _focusedDay = focused;
                        });
                      },
                      calendarFormat: CalendarFormat.month,
                      availableGestures: AvailableGestures.horizontalSwipe,
                      locale: 'pt_BR',
                      eventLoader: (d) => _events
                          .where((e) => _sameDay(e.startsAt, d))
                          .toList(),
                      headerStyle: const HeaderStyle(
                        formatButtonVisible: false,
                        titleCentered: true,
                      ),
                    ),
                    const Padding(
                      padding: EdgeInsets.fromLTRB(16, 12, 16, 4),
                      child: Text(
                        'Compromissos do dia',
                        style: TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                    if (dayEvents.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(
                            horizontal: 16, vertical: 12),
                        child: Text('Nenhum compromisso neste dia.'),
                      )
                    else
                      ...dayEvents.map(
                        (e) => ListTile(
                          leading: Icon(
                            e.source == 'GOOGLE'
                                ? Icons.sync
                                : Icons.event_outlined,
                            color: theme.colorScheme.primary,
                          ),
                          title: Text(e.title),
                          subtitle: Text(
                            '${_fmtTime(e.startsAt)}'
                            '${e.endsAt != null ? ' – ${_fmtTime(e.endsAt!)}' : ''}'
                            '${e.location != null ? ' · ${e.location}' : ''}',
                          ),
                          trailing: IconButton(
                            icon: const Icon(Icons.delete_outline),
                            onPressed: () async {
                              await api.deleteEvent(e.id);
                              _load();
                            },
                          ),
                        ),
                      ),
                    const Padding(
                      padding: EdgeInsets.fromLTRB(16, 12, 16, 4),
                      child: Text(
                        'Lembretes',
                        style: TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                    if (_reminders.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(
                            horizontal: 16, vertical: 12),
                        child: Text('Nenhum lembrete ativo.'),
                      )
                    else
                      ..._reminders.map(
                        (r) => ListTile(
                          leading: Icon(
                            Icons.notifications_active_outlined,
                            color: r.isDone
                                ? theme.disabledColor
                                : theme.colorScheme.tertiary,
                          ),
                          title: Text(
                            r.title,
                            style: r.isDone
                                ? TextStyle(
                                    decoration: TextDecoration.lineThrough,
                                    color: theme.disabledColor,
                                  )
                                : null,
                          ),
                          subtitle: Text(_fmtReminder(r)),
                          trailing: IconButton(
                            icon: const Icon(Icons.delete_outline),
                            onPressed: () async {
                              await api.deleteReminder(r.id);
                              _load();
                            },
                          ),
                        ),
                      ),
                  ],
                ),
    );
  }

  String _fmtTime(DateTime d) =>
      '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';

  String _fmtReminder(ReminderItem r) {
    final local = r.remindAt.toLocal();
    final when =
        '${local.day}/${local.month} às ${_fmtTime(local)}';
    if (r.repeatRule == 'DAILY') return '$when · todos os dias';
    if (r.repeatRule == 'WEEKLY') return '$when · semanal';
    return when;
  }

  bool _sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;
}
