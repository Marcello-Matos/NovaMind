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

  // ===== organizations =====
  Future<List<Organization>> listOrganizations() async =>
      (await client.get('/organizations') as List)
          .map((o) => Organization.fromJson(o))
          .toList();

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
