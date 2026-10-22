import '../config/env.dart';
import '../models/models.dart';
import 'api_client.dart';

/// Camada tipada sobre [ApiClient] — espelha os endpoints `/v1` do backend.
class NovaMindApi {
  final ApiClient client;
  NovaMindApi(this.client);

  // ===== auth =====
  Future<(String, User)> register(String name, String email, String password) async {
    final res = await client.post('/auth/register', {
      'name': name,
      'email': email,
      'password': password,
    });
    return (res['accessToken'] as String, User.fromJson(res['user']));
  }

  Future<(String, User)> login(String email, String password) async {
    final res = await client.post('/auth/login', {
      'email': email,
      'password': password,
    });
    return (res['accessToken'] as String, User.fromJson(res['user']));
  }

  Future<User> me() async => User.fromJson(await client.get('/auth/me'));

  /// Atualiza o perfil. `avatarDataUrl` salva a foto (data URL JPEG
  /// processado); `removeAvatar: true` limpa a foto; omita ambos para
  /// alterar apenas o nome. `eventReminderMinutes`: lembrete automático
  /// antes de compromissos (0 = desativado, null = padrão de 60).
  Future<User> updateMe({
    String? name,
    String? avatarDataUrl,
    bool removeAvatar = false,
    int? eventReminderMinutes,
    bool clearEventReminder = false,
  }) async {
    final body = <String, Object?>{
      'name': ?name,
      if (removeAvatar) 'avatarUrl': null,
      'avatarUrl': ?avatarDataUrl,
      if (clearEventReminder) 'eventReminderMinutes': null,
      'eventReminderMinutes': ?eventReminderMinutes,
    };
    return User.fromJson(await client.patch('/auth/me', body));
  }

  // ===== agenda / hábitos / notas / lembretes =====

  /// Compromissos no intervalo [from, to). Default: mês atual.
  Future<List<CalendarEventItem>> listEvents({
    DateTime? from,
    DateTime? to,
    String? organizationId,
  }) async {
    final q = <String, String>{
      'from': ?from?.toIso8601String(),
      'to': ?to?.toIso8601String(),
      'organizationId': ?organizationId,
    };
    final res = await client.get('/calendar', q);
    return (res as List).map((e) => CalendarEventItem.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<CalendarEventItem> createEvent({
    required String title,
    required DateTime startsAt,
    DateTime? endsAt,
    String? description,
    String? location,
    bool allDay = false,
    String? organizationId,
  }) async =>
      CalendarEventItem.fromJson(await client.post('/calendar', {
        'title': title,
        'startsAt': startsAt.toIso8601String(),
        'endsAt': ?endsAt,
        'description': ?description,
        'location': ?location,
        'allDay': allDay,
        'organizationId': ?organizationId,
      }));

  Future<void> deleteEvent(String id) => client.delete('/calendar/$id');

  Future<List<Habit>> listHabits() async {
    final res = await client.get('/habits');
    return (res as List).map((e) => Habit.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Habit> createHabit(String name, {String? daysOfWeek}) async =>
      Habit.fromJson(await client.post('/habits', {
        'name': name,
        'daysOfWeek': ?daysOfWeek,
      }));

  Future<void> deleteHabit(String id) => client.delete('/habits/$id');

  /// Marca/desmarca o hábito hoje.
  Future<void> toggleHabitToday(String habitId, {bool done = true}) =>
      client.post('/habits/$habitId/log', {'done': done});

  Future<List<HabitSummary>> habitSummary() async {
    final res = await client.get('/habits/summary');
    return (res as List).map((e) => HabitSummary.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<NoteItem>> listNotes({String? organizationId}) async {
    final res = await client.get('/notes', {
      'organizationId': ?organizationId,
    });
    return (res as List).map((e) => NoteItem.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<NoteItem> createNote({
    required String title,
    required String content,
    String? organizationId,
  }) async =>
      NoteItem.fromJson(await client.post('/notes', {
        'title': title,
        'content': content,
        'organizationId': ?organizationId,
      }));

  Future<void> deleteNote(String id) => client.delete('/notes/$id');

  Future<List<ReminderItem>> listReminders() async {
    final res = await client.get('/reminders');
    return (res as List).map((e) => ReminderItem.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<ReminderItem> createReminder({
    required String title,
    required DateTime remindAt,
    String repeatRule = 'NONE',
  }) async =>
      ReminderItem.fromJson(await client.post('/reminders', {
        'title': title,
        'remindAt': remindAt.toIso8601String(),
        'repeatRule': repeatRule,
      }));

  Future<void> deleteReminder(String id) => client.delete('/reminders/$id');

  /// Confirma lembretes cuja notificação local o app já tratou.
  Future<void> ackReminder(String id) =>
      client.post('/reminders/$id/ack', {});

  /// Lembretes vencidos ainda não confirmados — base das notificações locais.
  Future<List<ReminderItem>> dueReminders() async {
    final res = await client.get('/reminders/due');
    return (res as List).map((e) => ReminderItem.fromJson(e as Map<String, dynamic>)).toList();
  }

  // ===== integração Google Calendar =====

  /// `{connected: bool, googleEmail?, lastSyncAt?}`.
  Future<Map<String, dynamic>> googleStatus() async =>
      (await client.get('/integrations/google/status')) as Map<String, dynamic>;

  /// Sincronização bidirecional (importa do Google e envia eventos locais).
  Future<Map<String, dynamic>> googleSync() async =>
      (await client.post('/integrations/google/sync', {})) as Map<String, dynamic>;

  Future<void> googleDisconnect() => client.delete('/integrations/google');

  /// URL do consentimento OAuth aberta no navegador do sistema.
  String get googleAuthorizeUrl {
    final token = client.token ?? '';
    return '${Env.apiUrl}/v1/integrations/google/authorize'
        '?token=${Uri.encodeComponent(token)}';
  }

  // ===== login social =====
  Future<(String, User)> loginWithGoogle(String idToken) async {
    final res = await client.post('/auth/google', {'idToken': idToken});
    return (res['accessToken'] as String, User.fromJson(res['user']));
  }

  Future<(String, User)> loginWithApple(String identityToken, {String? name}) async {
    final res = await client.post('/auth/apple', {
      'identityToken': identityToken,
      'name': ?name,
    });
    return (res['accessToken'] as String, User.fromJson(res['user']));
  }

  // ===== organizations =====
  Future<List<Organization>> listOrganizations() async =>
      (await client.get('/organizations') as List)
          .map((o) => Organization.fromJson(o))
          .toList();

  /// Cria uma empresa (usuário vira OWNER) com slug gerado do nome.
  Future<Organization> createOrganization(String name) async {
    final base = name
        .toLowerCase()
        .trim()
        .replaceAll(RegExp(r'[^a-z0-9]+'), '-')
        .replaceAll(RegExp(r'^-+|-+$'), '');
    final slug =
        '${base.isEmpty ? 'empresa' : base}-${DateTime.now().millisecondsSinceEpoch % 100000}';
    return Organization.fromJson(
      await client.post('/organizations', {'name': name, 'slug': slug}),
    );
  }

  // ===== conversations =====
  Future<List<Conversation>> listConversations({String? organizationId}) async =>
      (await client.get('/conversations',
              organizationId == null ? null : {'organizationId': organizationId}) as List)
          .map((c) => Conversation.fromJson(c))
          .toList();

  Future<Conversation> createConversation({String? organizationId, String? agent}) async =>
      Conversation.fromJson(await client.post('/conversations', {
        'organizationId': ?organizationId,
        'agent': ?agent,
      }));

  Future<void> deleteConversation(String conversationId) =>
      client.delete('/conversations/$conversationId');

  Future<List<ChatMessage>> getMessages(String conversationId) async {
    final res = await client.get('/conversations/$conversationId');
    return (res['messages'] as List)
        .map((m) => ChatMessage.fromJson(m))
        .toList();
  }

  Future<(ChatMessage, List<PendingAction>)> sendMessage(
    String conversationId, {
    String? content,
    List<PendingAction>? confirmedActions,
  }) async {
    final res =
        await client.post('/conversations/$conversationId/messages', {
      'content': ?content,
      if (confirmedActions != null)
        'confirmedActions': confirmedActions
            .map((a) => {'tool': a.tool, 'parameters': a.parameters})
            .toList(),
    });
    final pending = (res['pendingActions'] as List? ?? [])
        .map((p) => PendingAction.fromJson(p))
        .toList();
    return (ChatMessage.fromJson(res['message']), pending);
  }

  // ===== tasks =====
  Future<List<TaskItem>> listTasks({String? organizationId}) async =>
      (await client.get(
              '/tasks', organizationId == null ? null : {'organizationId': organizationId}) as List)
          .map((t) => TaskItem.fromJson(t))
          .toList();

  Future<TaskItem> createTask(Map<String, dynamic> data) async =>
      TaskItem.fromJson(await client.post('/tasks', data));

  Future<TaskItem> updateTask(String id, Map<String, dynamic> data) async =>
      TaskItem.fromJson(await client.patch('/tasks/$id', data));

  // ===== memory =====
  Future<List<MemoryEntry>> listMemories() async =>
      (await client.get('/memory') as List)
          .map((m) => MemoryEntry.fromJson(m))
          .toList();

  Future<MemoryEntry> createMemory(String key, String value) async =>
      MemoryEntry.fromJson(await client.post('/memory', {'key': key, 'value': value}));

  Future<MemoryEntry> updateMemory(String id, Map<String, dynamic> data) async =>
      MemoryEntry.fromJson(await client.patch('/memory/$id', data));

  Future<void> deleteMemory(String id) async => client.delete('/memory/$id');

  // ===== knowledge base =====
  Future<List<KnowledgeDocument>> listDocuments({String? organizationId}) async =>
      (await client.get('/knowledge-base/documents',
              organizationId == null ? null : {'organizationId': organizationId}) as List)
          .map((d) => KnowledgeDocument.fromJson(d))
          .toList();

  Future<KnowledgeDocument> uploadDocument(
    List<int> bytes,
    String fileName, {
    String? organizationId,
  }) async =>
      KnowledgeDocument.fromJson(await client.uploadFile(
        '/knowledge-base/documents',
        bytes,
        fileName,
        query: organizationId == null ? null : {'organizationId': organizationId},
      ));

  // ===== usage =====
  Future<UsageSummary> usageSummary() async =>
      UsageSummary.fromJson(await client.get('/usage/summary'));
}
