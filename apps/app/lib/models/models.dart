class User {
  final String id;
  final String email;
  final String name;
  final List<Membership> members;

  User({
    required this.id,
    required this.email,
    required this.name,
    this.members = const [],
  });

  factory User.fromJson(Map<String, dynamic> json) => User(
        id: json['id'] as String,
        email: json['email'] as String,
        name: json['name'] as String,
        members: (json['members'] as List<dynamic>? ?? [])
            .map((m) => Membership.fromJson(m))
            .toList(),
      );
}

class Membership {
  final String role;
  final Organization organization;

  Membership({required this.role, required this.organization});

  factory Membership.fromJson(Map<String, dynamic> json) => Membership(
        role: json['role'] as String,
        organization: Organization.fromJson(json['organization']),
      );
}

class Organization {
  final String id;
  final String name;
  final String slug;
  final String plan;

  Organization({
    required this.id,
    required this.name,
    required this.slug,
    required this.plan,
  });

  factory Organization.fromJson(Map<String, dynamic> json) => Organization(
        id: json['id'] as String,
        name: json['name'] as String,
        slug: json['slug'] as String,
        plan: json['plan'] as String? ?? 'FREE',
      );
}

class Conversation {
  final String id;
  final String? title;
  final String agent;
  final String? organizationId;

  Conversation({
    required this.id,
    this.title,
    required this.agent,
    this.organizationId,
  });

  factory Conversation.fromJson(Map<String, dynamic> json) => Conversation(
        id: json['id'] as String,
        title: json['title'] as String?,
        agent: json['agent'] as String,
        organizationId: json['organizationId'] as String?,
      );
}

class ChatMessage {
  final String id;
  final String role; // USER | ASSISTANT | SYSTEM | TOOL
  final String content;
  final DateTime createdAt;

  ChatMessage({
    required this.id,
    required this.role,
    required this.content,
    required this.createdAt,
  });

  bool get isUser => role == 'USER';

  factory ChatMessage.fromJson(Map<String, dynamic> json) => ChatMessage(
        id: json['id'] as String,
        role: json['role'] as String,
        content: json['content'] as String,
        createdAt: DateTime.parse(json['createdAt'] as String),
      );
}

class PendingAction {
  final String tool;
  final Map<String, dynamic> parameters;

  PendingAction({required this.tool, required this.parameters});

  factory PendingAction.fromJson(Map<String, dynamic> json) => PendingAction(
        tool: json['tool'] as String,
        parameters: Map<String, dynamic>.from(json['parameters'] ?? {}),
      );
}

class TaskItem {
  final String id;
  final String title;
  final String? description;
  final String status; // OPEN | IN_PROGRESS | DONE | CANCELLED
  final String priority;
  final DateTime? dueAt;

  TaskItem({
    required this.id,
    required this.title,
    this.description,
    required this.status,
    required this.priority,
    this.dueAt,
  });

  bool get isDone => status == 'DONE';

  factory TaskItem.fromJson(Map<String, dynamic> json) => TaskItem(
        id: json['id'] as String,
        title: json['title'] as String,
        description: json['description'] as String?,
        status: json['status'] as String,
        priority: json['priority'] as String,
        dueAt: json['dueAt'] == null ? null : DateTime.parse(json['dueAt']),
      );
}

class MemoryEntry {
  final String id;
  final String key;
  final String value;
  final bool enabled;

  MemoryEntry({
    required this.id,
    required this.key,
    required this.value,
    required this.enabled,
  });

  factory MemoryEntry.fromJson(Map<String, dynamic> json) => MemoryEntry(
        id: json['id'] as String,
        key: json['key'] as String,
        value: json['value'] as String,
        enabled: json['enabled'] as bool? ?? true,
      );
}

class KnowledgeDocument {
  final String id;
  final String fileName;
  final String mimeType;
  final int sizeBytes;
  final String status;

  KnowledgeDocument({
    required this.id,
    required this.fileName,
    required this.mimeType,
    required this.sizeBytes,
    required this.status,
  });

  factory KnowledgeDocument.fromJson(Map<String, dynamic> json) =>
      KnowledgeDocument(
        id: json['id'] as String,
        fileName: json['fileName'] as String,
        mimeType: json['mimeType'] as String,
        sizeBytes: json['sizeBytes'] as int,
        status: json['status'] as String,
      );
}

class UsageSummary {
  final int monthEvents;
  final int monthTokens;
  final double monthCostUsd;

  UsageSummary({
    required this.monthEvents,
    required this.monthTokens,
    required this.monthCostUsd,
  });

  factory UsageSummary.fromJson(Map<String, dynamic> json) {
    final m = json['currentMonth'] as Map<String, dynamic>;
    return UsageSummary(
      monthEvents: m['events'] as int? ?? 0,
      monthTokens:
          (m['promptTokens'] as int? ?? 0) + (m['completionTokens'] as int? ?? 0),
      monthCostUsd: (m['estimatedCostUsd'] as num?)?.toDouble() ?? 0,
    );
  }
}
