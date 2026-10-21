import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../services/api_client.dart';
import '../../services/novamind_api.dart';
import '../../state/auth_controller.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _input = TextEditingController();
  List<Conversation> _conversations = [];
  List<ChatMessage> _messages = [];
  List<PendingAction> _pending = [];
  String? _activeId;
  bool _sending = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _reload());
  }

  String? _lastOrg;
  AuthController? _auth;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Recarrega quando o ambiente (organização) muda.
    final auth = context.read<AuthController>();
    if (!identical(auth, _auth)) {
      _auth?.removeListener(_onEnvChange);
      _auth = auth;
      _lastOrg = auth.activeOrgId;
      auth.addListener(_onEnvChange);
    }
  }

  void _onEnvChange() {
    final org = _auth?.activeOrgId;
    if (org != _lastOrg) {
      _lastOrg = org;
      setState(() {
        _activeId = null;
        _messages = [];
        _pending = [];
      });
      _reload();
    }
  }

  @override
  void dispose() {
    _auth?.removeListener(_onEnvChange);
    _input.dispose();
    super.dispose();
  }

  NovaMindApi get _api => context.read<AuthController>().api;
  String? get _org => context.read<AuthController>().activeOrgId;

  Future<void> _reload() async {
    try {
      final list = await _api.listConversations(organizationId: _org);
      if (mounted) setState(() => _conversations = list);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<void> _open(Conversation c) async {
    setState(() {
      _activeId = c.id;
      _messages = [];
      _pending = [];
    });
    try {
      final messages = await _api.getMessages(c.id);
      if (mounted) setState(() => _messages = messages);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<void> _newConversation() async {
    try {
      final c = await _api.createConversation(organizationId: _org);
      setState(() {
        _conversations.insert(0, c);
        _activeId = c.id;
        _messages = [];
        _pending = [];
      });
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    }
  }

  Future<void> _submit({String? content, List<PendingAction>? actions}) async {
    if (_sending) return;
    setState(() {
      _sending = true;
      _error = null;
      if (content != null) {
        _messages.add(ChatMessage(
          id: 'tmp',
          role: 'USER',
          content: content,
          createdAt: DateTime.now(),
        ));
      }
    });
    try {
      _activeId ??= (await _api.createConversation(organizationId: _org)).id;
      final res = await _api.sendMessage(
        _activeId!,
        content: content,
        confirmedActions: actions,
      );
      final messages = await _api.getMessages(_activeId!);
      setState(() {
        _messages = messages;
        _pending = res.$2;
      });
      _reload();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty) return;
    _input.clear();
    await _submit(content: text);
  }

  Future<void> _confirmAction(PendingAction action) async {
    setState(() => _pending.remove(action));
    await _submit(actions: [action]);
  }

  void _declineAction(PendingAction action) {
    setState(() => _pending.remove(action));
    // Avisa o assistente para não propor a mesma ação novamente.
    _submit(content: 'Não quero executar a ação "${action.tool}".');
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        SizedBox(
          width: 240,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(12),
                child: FilledButton.tonalIcon(
                  onPressed: _newConversation,
                  icon: const Icon(Icons.add),
                  label: const Text('Nova conversa'),
                ),
              ),
              Expanded(
                child: ListView.builder(
                  itemCount: _conversations.length,
                  itemBuilder: (_, i) {
                    final c = _conversations[i];
                    return ListTile(
                      dense: true,
                      selected: c.id == _activeId,
                      title: Text(
                        c.title ?? 'Sem título',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      onTap: () => _open(c),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
        const VerticalDivider(width: 1),
        Expanded(
          child: Column(
            children: [
              Expanded(
                child: _messages.isEmpty
                    ? Center(
                        child: Text(
                          'Como posso ajudar?\nConverse, crie tarefas ou resuma documentos.',
                          textAlign: TextAlign.center,
                          style: theme.textTheme.bodyLarge
                              ?.copyWith(color: theme.hintColor),
                        ),
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _messages.length,
                        itemBuilder: (_, i) {
                          final m = _messages[i];
                          return Align(
                            alignment: m.isUser
                                ? Alignment.centerRight
                                : Alignment.centerLeft,
                            child: Container(
                              margin: const EdgeInsets.symmetric(vertical: 4),
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 14, vertical: 10),
                              constraints:
                                  const BoxConstraints(maxWidth: 560),
                              decoration: BoxDecoration(
                                color: m.isUser
                                    ? theme.colorScheme.primaryContainer
                                    : theme.colorScheme.surfaceContainerHighest,
                                borderRadius: BorderRadius.circular(16),
                              ),
                              child: Text(m.content),
                            ),
                          );
                        },
                      ),
              ),
              if (_sending)
                const LinearProgressIndicator(minHeight: 2),
              if (_pending.isNotEmpty)
                Container(
                  width: double.infinity,
                  color: Colors.amber.withValues(alpha: 0.08),
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Ações sensíveis aguardando sua confirmação',
                        style: TextStyle(
                          color: Colors.amber,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 8),
                      ..._pending.map(
                        (a) => _PendingActionCard(
                          action: a,
                          onConfirm: () => _confirmAction(a),
                          onDecline: () => _declineAction(a),
                        ),
                      ),
                    ],
                  ),
                ),
              if (_error != null)
                Container(
                  width: double.infinity,
                  color: theme.colorScheme.errorContainer,
                  padding: const EdgeInsets.all(10),
                  child: Text(_error!,
                      style:
                          TextStyle(color: theme.colorScheme.onErrorContainer)),
                ),
              Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _input,
                        decoration: InputDecoration(
                          hintText: _org == null
                              ? 'Mensagem para o assistente pessoal…'
                              : 'Pergunte sobre a empresa, leads ou documentos…',
                          border: const OutlineInputBorder(),
                          isDense: true,
                        ),
                        onSubmitted: (_) => _send(),
                      ),
                    ),
                    const SizedBox(width: 8),
                    FilledButton(
                      onPressed: _sending ? null : _send,
                      child: const Text('Enviar'),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _PendingActionCard extends StatelessWidget {
  final PendingAction action;
  final VoidCallback onConfirm;
  final VoidCallback onDecline;

  const _PendingActionCard({
    required this.action,
    required this.onConfirm,
    required this.onDecline,
  });

  static const _labels = {
    'create_calendar_event': 'Criar compromisso na agenda',
    'send_message': 'Enviar mensagem',
  };

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              _labels[action.tool] ?? action.tool,
              style: theme.textTheme.titleSmall,
            ),
            const SizedBox(height: 6),
            ...action.parameters.entries.map(
              (e) => Text(
                '${e.key}: ${e.value}',
                style: theme.textTheme.bodySmall,
              ),
            ),
            const SizedBox(height: 10),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(
                  onPressed: onDecline,
                  child: const Text('Recusar'),
                ),
                const SizedBox(width: 8),
                FilledButton.icon(
                  onPressed: onConfirm,
                  icon: const Icon(Icons.check, size: 16),
                  label: const Text('Confirmar'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
