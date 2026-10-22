import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:table_calendar/table_calendar.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../models/models.dart';
import '../../services/api_client.dart';
import '../../services/novamind_api.dart';
import '../../services/reminder_notifications.dart';
import '../../state/auth_controller.dart';

/// Agenda de compromissos: calendário mensal + lista do dia + lembretes.
/// Compromissos criados no modo empresarial ficam visíveis à equipe.
class AgendaScreen extends StatefulWidget {
  const AgendaScreen({super.key});

  @override
  State<AgendaScreen> createState() => _AgendaScreenState();
}

class _AgendaScreenState extends State<AgendaScreen>
    with WidgetsBindingObserver {
  NovaMindApi get api => context.read<AuthController>().api;
  DateTime _focusedDay = DateTime.now();
  DateTime _selectedDay = DateTime.now();
  List<CalendarEventItem> _events = [];
  List<ReminderItem> _reminders = [];
  bool _loading = true;
  String? _error;
  bool _googleConnected = false;
  String? _googleEmail;
  DateTime? _googleLastSync;
  bool _googleSyncing = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// Voltou do navegador (consentimento do Google): recarrega status + eventos.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _googleConnected) {
      _load();
    } else if (state == AppLifecycleState.resumed) {
      _loadGoogleStatus().then((_) {
        if (_googleConnected && mounted) _load();
      });
    }
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
    await _loadGoogleStatus();
  }

  Future<void> _loadGoogleStatus() async {
    try {
      final status = await api.googleStatus();
      if (!mounted) return;
      setState(() {
        _googleConnected = status['connected'] == true;
        _googleEmail = status['googleEmail'] as String?;
        _googleLastSync = status['lastSyncAt'] != null
            ? DateTime.parse(status['lastSyncAt'] as String)
            : null;
      });
    } on ApiException {
      // Integração indisponível: card fica oculto/sem status.
    }
  }

  Future<void> _connectGoogle() async {
    final url = Uri.parse(api.googleAuthorizeUrl);
    try {
      await launchUrl(url, mode: LaunchMode.externalApplication);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Não foi possível abrir o navegador.')),
        );
      }
    }
  }

  Future<void> _syncGoogle() async {
    setState(() => _googleSyncing = true);
    try {
      final res = await api.googleSync();
      if (!mounted) return;
      final holidays = res['holidays'] as int?;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(
          'Sincronizado: ${res['imported'] ?? 0} importados, '
          '${res['pushed'] ?? 0} enviados'
          '${holidays == null ? '' : holidays < 0 ? ' · feriados: falha' : ' · $holidays feriados'}',
        ),
      ));
      // Novos compromissos podem ter gerado lembretes: reagenda as notificações.
      ReminderNotificationService(api: api).syncReminders();
      await _load();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _googleSyncing = false);
    }
  }

  String _reminderLabel(BuildContext context) {
    final minutes =
        context.read<AuthController>().user?.eventReminderMinutes ?? 60;
    if (minutes <= 0) return 'desativado';
    if (minutes < 60) return '$minutes min antes';
    if (minutes == 60) return '1 hora antes';
    if (minutes == 1440) return '1 dia antes';
    return '${minutes ~/ 60} horas antes';
  }

  Future<void> _pickReminderLead() async {
    final auth = context.read<AuthController>();
    final current = auth.user?.eventReminderMinutes ?? 60;
    const options = <(int?, String)>[
      (null, '1 hora antes (padrão)'),
      (0, 'Desativado'),
      (15, '15 minutos antes'),
      (30, '30 minutos antes'),
      (60, '1 hora antes'),
      (1440, '1 dia antes'),
    ];
    final picked = await showModalBottomSheet<int>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.all(16),
              child: Text(
                'Lembrete automático de compromissos',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
            ...options.map(
              (o) => ListTile(
                title: Text(o.$2),
                trailing: (o.$1 ?? 60) == current
                    ? const Icon(Icons.check)
                    : null,
                onTap: () => Navigator.pop(sheetContext, o.$1),
              ),
            ),
          ],
        ),
      ),
    );
    if (picked == null || !mounted) return;
    final err = await auth.updateEventReminderMinutes(picked);
    if (err != null && mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(err)));
    } else if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Lembrete: ${_reminderLabel(context)}')),
      );
    }
  }

  Future<void> _disconnectGoogle() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Desconectar Google Calendar'),
        content: const Text(
          'Os compromissos já importados continuam no NovaMind, '
          'mas não haverá mais sincronização.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Desconectar'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await api.googleDisconnect();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
      return;
    }
    await _loadGoogleStatus();
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
      // A API cria o lembrete automático; reagenda as notificações locais.
      ReminderNotificationService(api: api).syncReminders();
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
        .where((e) => _sameDay(_eventDay(e), _selectedDay))
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
                          .where((e) => _sameDay(_eventDay(e), d))
                          .toList(),
                      calendarBuilders: CalendarBuilders(
                        markerBuilder: (context, day, events) {
                          if (events.isEmpty) return null;
                          final items = events.cast<CalendarEventItem>();
                          final hasHoliday = items.any((e) => e.isHoliday);
                          final hasEvent = items.any((e) => !e.isHoliday);
                          return Row(
                            mainAxisSize: MainAxisSize.min,
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              if (hasHoliday)
                                _markerDot(theme.colorScheme.error),
                              if (hasHoliday && hasEvent)
                                const SizedBox(width: 3),
                              if (hasEvent)
                                _markerDot(theme.colorScheme.primary),
                            ],
                          );
                        },
                      ),
                      headerStyle: const HeaderStyle(
                        formatButtonVisible: false,
                        titleCentered: true,
                      ),
                    ),
                    _googleCard(theme),
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
                            e.isHoliday
                                ? Icons.celebration_outlined
                                : e.source == 'GOOGLE'
                                    ? Icons.sync
                                    : Icons.event_outlined,
                            color: e.isHoliday
                                ? theme.colorScheme.tertiary
                                : theme.colorScheme.primary,
                          ),
                          title: Text(e.title),
                          subtitle: Text(
                            e.isHoliday
                                ? 'Feriado nacional'
                                : '${_fmtTime(e.startsAt)}'
                                    '${e.endsAt != null ? ' – ${_fmtTime(e.endsAt!)}' : ''}'
                                    '${e.location != null ? ' · ${e.location}' : ''}',
                          ),
                          trailing: e.isHoliday
                              ? null
                              : IconButton(
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
                    ListTile(
                      leading: Icon(
                        Icons.alarm_add_outlined,
                        color: theme.colorScheme.primary,
                      ),
                      title: const Text('Lembrete automático'),
                      subtitle: Text(
                        'Antes de cada compromisso: ${_reminderLabel(context)}',
                      ),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: _pickReminderLead,
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

  Widget _googleCard(ThemeData theme) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  _googleConnected ? Icons.event_available : Icons.event_busy,
                  color: _googleConnected
                      ? theme.colorScheme.primary
                      : theme.disabledColor,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Google Calendar',
                    style: theme.textTheme.titleSmall
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              _googleConnected
                  ? 'Conectado'
                  : 'Sincronize seus compromissos nos dois sentidos.',
              style: theme.textTheme.bodySmall,
            ),
            if (_googleConnected && _googleEmail != null)
              Text(_googleEmail!, style: theme.textTheme.bodySmall),
            if (_googleConnected && _googleLastSync != null)
              Text(
                'Última sync: ${_googleLastSync!.toLocal().day}/${_googleLastSync!.toLocal().month} '
                'às ${_fmtTime(_googleLastSync!.toLocal())}',
                style: theme.textTheme.bodySmall,
              ),
            const SizedBox(height: 8),
            Row(
              children: [
                if (!_googleConnected)
                  FilledButton.icon(
                    onPressed: _connectGoogle,
                    icon: const Icon(Icons.link, size: 18),
                    label: const Text('Conectar'),
                  )
                else ...[
                  FilledButton.icon(
                    onPressed: _googleSyncing ? null : _syncGoogle,
                    icon: _googleSyncing
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.sync, size: 18),
                    label: const Text('Sincronizar agora'),
                  ),
                  const SizedBox(width: 8),
                  TextButton(
                    onPressed: _disconnectGoogle,
                    child: const Text('Desconectar'),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _fmtTime(DateTime d) =>
      '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';

  /// Dia do evento já convertido: eventos de dia inteiro (feriados) chegam
  /// como meia-noite UTC e, no fuso -03:00, cairiam no dia anterior.
  DateTime _eventDay(CalendarEventItem e) =>
      e.allDay ? e.startsAt.toUtc() : e.startsAt;

  Widget _markerDot(Color color) => Container(
        width: 6,
        height: 6,
        decoration: BoxDecoration(color: color, shape: BoxShape.circle),
      );

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
