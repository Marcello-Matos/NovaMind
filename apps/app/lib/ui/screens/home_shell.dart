import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../services/avatar_service.dart';
import '../../state/auth_controller.dart';
import '../../state/theme_controller.dart';
import 'agenda_screen.dart';
import 'chat_screen.dart';
import 'documents_screen.dart';
import 'habits_notes_screen.dart';
import 'memory_screen.dart';
import 'tasks_screen.dart';
import 'usage_screen.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;
  bool _creatingOrg = false;

  static const _destinations = [
    (icon: Icons.chat_bubble_outline, label: 'Chat'),
    (icon: Icons.check_circle_outline, label: 'Tarefas'),
    (icon: Icons.calendar_month_outlined, label: 'Agenda'),
    (icon: Icons.repeat_outlined, label: 'Rotina'),
    (icon: Icons.psychology_outlined, label: 'Memória'),
    (icon: Icons.folder_outlined, label: 'Docs'),
    (icon: Icons.insights_outlined, label: 'Uso'),
  ];

  static const _screens = [
    ChatScreen(),
    TasksScreen(),
    AgendaScreen(),
    HabitsNotesScreen(),
    MemoryScreen(),
    DocumentsScreen(),
    UsageScreen(),
  ];

  static const _createOrgOption = '__create_org__';

  Future<void> _showCreateOrgDialog() async {
    final controller = TextEditingController();
    final error = await showDialog<String>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Nova empresa'),
          content: TextField(
            controller: controller,
            autofocus: true,
            decoration: const InputDecoration(
              labelText: 'Nome da empresa',
              prefixIcon: Icon(Icons.business_outlined),
            ),
            onSubmitted: (_) =>
                Navigator.pop(context, controller.text.trim()),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancelar'),
            ),
            FilledButton(
              onPressed: () {
                if (controller.text.trim().isEmpty) return;
                Navigator.pop(context, controller.text.trim());
              },
              child: Text(_creatingOrg ? 'Criando…' : 'Criar'),
            ),
          ],
        ),
      ),
    );
    if (error == null || error.isEmpty || !mounted) return;
    setState(() => _creatingOrg = true);
    final createError =
        await context.read<AuthController>().createOrganization(error);
    if (!mounted) return;
    setState(() => _creatingOrg = false);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(createError ??
            'Empresa criada! Modo empresarial ativado.'),
      ),
    );
  }

  Widget _orgSelector(AuthController auth) {
    return DropdownButton<String?>(
      value: auth.activeOrgId,
      underline: const SizedBox.shrink(),
      isExpanded: true,
      items: [
        const DropdownMenuItem(
          value: null,
          child: Row(
            children: [
              Icon(Icons.person_outline, size: 18),
              SizedBox(width: 6),
              Text('Pessoal'),
            ],
          ),
        ),
        ...auth.organizations.map(
          (o) => DropdownMenuItem(
            value: o.id,
            child: Row(
              children: [
                const Icon(Icons.business_outlined, size: 18),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    o.name,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),
        ),
        const DropdownMenuItem(
          value: _createOrgOption,
          child: Row(
            children: [
              Icon(Icons.add_business_outlined, size: 18),
              SizedBox(width: 6),
              Text('Nova empresa…'),
            ],
          ),
        ),
      ],
      onChanged: (value) {
        if (value == _createOrgOption) {
          _showCreateOrgDialog();
        } else {
          auth.setActiveOrg(value);
        }
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final wide = MediaQuery.of(context).size.width >= 720;
    final activeOrg = auth.organizations
        .where((o) => o.id == auth.activeOrgId)
        .firstOrNull;

    final orgSelector = _orgSelector(auth);

    // Título reflete o modo ativo: Pessoal (pessoa) vs. empresa (negócio).
    final titleRow = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          activeOrg == null ? Icons.person_outline : Icons.business_outlined,
          size: 20,
        ),
        const SizedBox(width: 8),
        Flexible(
          child: Text(
            activeOrg?.name ?? 'NovaMind',
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.titleMedium,
          ),
        ),
        const SizedBox(width: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(
            color: activeOrg == null
                ? Theme.of(context).colorScheme.secondaryContainer
                : Theme.of(context).colorScheme.primaryContainer,
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(
            activeOrg == null ? 'PESSOAL' : 'EMPRESARIAL',
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.5,
                  color: activeOrg == null
                      ? Theme.of(context).colorScheme.onSecondaryContainer
                      : Theme.of(context).colorScheme.onPrimaryContainer,
                ),
          ),
        ),
      ],
    );

    final navDestinations = _destinations
        .map((d) => NavigationRailDestination(
              icon: Icon(d.icon),
              label: Text(d.label),
            ))
        .toList();

    final body = _screens[_index];

    if (!wide) {
      // Layout compacto (mobile): NavigationBar inferior
      return Scaffold(
        appBar: AppBar(
          title: titleRow,
          actions: [
            SizedBox(width: 150, child: orgSelector),
            const UserMenuButton(),
          ],
        ),
        body: body,
        bottomNavigationBar: NavigationBar(
          selectedIndex: _index,
          onDestinationSelected: (i) => setState(() => _index = i),
          destinations: _destinations
              .map((d) => NavigationDestination(
                    icon: Icon(d.icon),
                    label: d.label,
                  ))
              .toList(),
        ),
      );
    }

    // Layout amplo (web/desktop): NavigationRail lateral
    return Scaffold(
      body: Row(
        children: [
          NavigationRail(
            selectedIndex: _index,
            onDestinationSelected: (i) => setState(() => _index = i),
            labelType: NavigationRailLabelType.all,
            leading: Column(
              children: [
                const SizedBox(height: 8),
                titleRow,
                const SizedBox(height: 12),
                SizedBox(width: 140, child: orgSelector),
                const SizedBox(height: 8),
              ],
            ),
            trailing: const Expanded(
              child: Align(
                alignment: Alignment.bottomCenter,
                child: Padding(
                  padding: EdgeInsets.only(bottom: 12),
                  child: UserMenuButton(),
                ),
              ),
            ),
            destinations: navDestinations,
          ),
          const VerticalDivider(width: 1),
          Expanded(child: body),
        ],
      ),
    );
  }
}

/// Botão de perfil: avatar do usuário (foto própria, do Google ou
/// inicial do nome) com menu — alterar foto, informações da conta,
/// alternância de tema e sair.
class UserMenuButton extends StatelessWidget {
  const UserMenuButton({super.key});

  Future<void> _changePhoto(BuildContext context, {bool camera = false}) async {
    final auth = context.read<AuthController>();
    final messenger = ScaffoldMessenger.of(context);
    messenger.showSnackBar(
      const SnackBar(content: Text('Processando foto…'), duration: Duration(minutes: 1)),
    );
    try {
      final avatar = AvatarService();
      final dataUrl = camera
          ? await avatar.shootAndProcess()
          : await avatar.pickAndProcess();
      if (dataUrl == null) {
        messenger.hideCurrentSnackBar();
        return;
      }
      final error = await auth.updateAvatar(dataUrl);
      messenger.hideCurrentSnackBar();
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            error ?? 'Foto de perfil atualizada!',
          ),
        ),
      );
    } on FormatException {
      messenger.hideCurrentSnackBar();
      messenger.showSnackBar(
        const SnackBar(content: Text('Arquivo de imagem inválido')),
      );
    } on FileSystemException {
      messenger.hideCurrentSnackBar();
      messenger.showSnackBar(
        const SnackBar(content: Text('Não foi possível ler a imagem')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthController>().user;
    final theme = context.watch<ThemeController>();
    return PopupMenuButton<String>(
      tooltip: 'Conta (${user?.email ?? ''})',
      offset: const Offset(0, 44),
      icon: _UserAvatar(user: user),
      onSelected: (value) {
        if (value == 'photo_gallery') _changePhoto(context);
        if (value == 'photo_camera') _changePhoto(context, camera: true);
        if (value == 'photo_remove') {
          context.read<AuthController>().updateAvatar(null, remove: true);
        }
        if (value == 'theme') context.read<ThemeController>().toggle();
        if (value == 'logout') context.read<AuthController>().logout();
      },
      itemBuilder: (_) => [
        PopupMenuItem<String>(
          enabled: false,
          child: ListTile(
            contentPadding: EdgeInsets.zero,
            leading: _UserAvatar(user: user, radius: 20),
            title: Text(user?.name ?? ''),
            subtitle: Text(user?.email ?? ''),
          ),
        ),
        const PopupMenuDivider(),
        PopupMenuItem<String>(
          value: 'photo_gallery',
          child: ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.photo_outlined),
            title: Text('Alterar foto (galeria)'),
          ),
        ),
        PopupMenuItem<String>(
          value: 'photo_camera',
          child: ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.photo_camera_outlined),
            title: Text('Tirar foto'),
          ),
        ),
        if (user?.avatarUrl != null && user!.avatarUrl!.isNotEmpty)
          PopupMenuItem<String>(
            value: 'photo_remove',
            child: ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.no_photography_outlined),
              title: Text('Remover foto'),
            ),
          ),
        PopupMenuItem<String>(
          value: 'theme',
          child: ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(theme.isDark
                ? Icons.light_mode_outlined
                : Icons.dark_mode_outlined),
            title: Text(theme.isDark ? 'Tema claro' : 'Tema escuro'),
          ),
        ),
        const PopupMenuItem<String>(
          value: 'logout',
          child: ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(Icons.logout),
            title: Text('Sair'),
          ),
        ),
      ],
    );
  }
}

class _UserAvatar extends StatelessWidget {
  final User? user;
  final double radius;

  const _UserAvatar({required this.user, this.radius = 16});

  @override
  Widget build(BuildContext context) {
    final url = user?.avatarUrl;
    final initial = (user?.name.isNotEmpty == true
            ? user!.name
            : user?.email ?? '?')
        .trim()[0]
        .toUpperCase();
    ImageProvider? provider;
    if (url != null && url.isNotEmpty) {
      if (url.startsWith('data:')) {
        try {
          provider = MemoryImage(
            base64Decode(url.substring(url.indexOf(',') + 1)),
          );
        } on FormatException {
          provider = null;
        }
      } else {
        provider = NetworkImage(url);
      }
    }
    return CircleAvatar(
      radius: radius,
      backgroundImage: provider,
      child: provider == null ? Text(initial) : null,
    );
  }
}
