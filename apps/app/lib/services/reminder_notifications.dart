import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

import 'api_client.dart';
import 'novamind_api.dart';

/// Notificações locais de lembretes.
///
/// Sem servidor de push (APNs exige conta Apple paga): o app busca os
/// lembretes na API e agenda as notificações locais no próprio aparelho.
/// Vencidos aparecem imediatamente; futuros são agendados no horário local.
class ReminderNotificationService {
  ReminderNotificationService({required this.api});

  final NovaMindApi api;
  final _plugin = FlutterLocalNotificationsPlugin();
  bool _initialized = false;

  Future<void> _init() async {
    if (_initialized) return;
    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    const ios = DarwinInitializationSettings(
      requestAlertPermission: true,
      requestBadgePermission: true,
      requestSoundPermission: true,
    );
    await _plugin.initialize(
      const InitializationSettings(android: android, iOS: ios),
    );
    tzdata.initializeTimeZones();
    try {
      final info = await FlutterTimezone.getLocalTimezone();
      tz.setLocalLocation(tz.getLocation(info.identifier));
    } on Exception {
      // Fallback Brasil: fuso padrão se o device não reportar o nome.
      tz.setLocalLocation(tz.getLocation('America/Sao_Paulo'));
    }
    _initialized = true;
  }

  /// Sincroniza lembretes: dispara os vencidos e agenda os futuros.
  /// Chamado após login e a cada abertura/sync do app.
  Future<void> syncReminders() async {
    if (kIsWeb) return; // notificações locais só existem no mobile
    await _init();
    try {
      final due = await api.dueReminders();
      final upcoming = await api.listReminders();

      // Vencidos: mostra na hora e confirma (ack) para não repetir.
      for (final r in due) {
        await _showNow(r.id, r.title);
        await api.ackReminder(r.id);
      }

      // Futuros: agenda notificação local (limitado aos próximos 20).
      final future = upcoming
          .where((r) => r.remindAt.isAfter(DateTime.now()))
          .take(20)
          .toList();
      await _plugin.cancelAll();
      for (final r in future) {
        await _schedule(r.id, r.title, r.remindAt);
      }
    } on ApiException {
      // Sem conexão: tenta de novo no próximo sync.
    }
  }

  NotificationDetails get _details => const NotificationDetails(
        android: AndroidNotificationDetails(
          'reminders',
          'Lembretes',
          channelDescription: 'Lembretes do NovaMind',
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: DarwinNotificationDetails(),
      );

  Future<void> _showNow(String id, String title) async {
    await _plugin.show(id.hashCode & 0x7fffffff, 'NovaMind', title, _details);
  }

  Future<void> _schedule(String id, String title, DateTime when) async {
    final local = when.toLocal();
    if (local.isBefore(DateTime.now())) return;
    await _plugin.zonedSchedule(
      id.hashCode & 0x7fffffff,
      'NovaMind',
      title,
      tz.TZDateTime.from(local, tz.local),
      _details,
      androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
      uiLocalNotificationDateInterpretation:
          UILocalNotificationDateInterpretation.absoluteTime,
    );
  }
}
