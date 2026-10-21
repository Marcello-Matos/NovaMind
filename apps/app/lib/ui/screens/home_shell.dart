import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../state/auth_controller.dart';
import '../../state/theme_controller.dart';
import 'chat_screen.dart';
import 'documents_screen.dart';
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

  static const _destinations = [
    (icon: Icons.chat_bubble_outline, label: 'Chat'),
    (icon: Icons.check_circle_outline, label: 'Tarefas'),
    (icon: Icons.psychology_outlined, label: 'Memória'),
    (icon: Icons.folder_outlined, label: 'Documentos'),
    (icon: Icons.insights_outlined, label: 'Uso e plano'),
  ];

  static const _screens = [
    ChatScreen(),
    TasksScreen(),
    MemoryScreen(),
    DocumentsScreen(),
    UsageScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final wide = MediaQuery.of(context).size.width >= 720;

    final orgSelector = DropdownButton<String?>(
      value: auth.activeOrgId,
      underline: const SizedBox.shrink(),
      isExpanded: true,
      items: [
        const DropdownMenuItem(value: null, child: Text('Pessoal')),
        ...auth.organizations.map(
          (o) => DropdownMenuItem(value: o.id, child: Text(o.name)),
        ),
      ],
      onChanged: auth.setActiveOrg,
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
          title: const Text('NovaMind'),
          actions: [
            SizedBox(width: 130, child: orgSelector),
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
                Text('NovaMind',
                    style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 16),
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

/// Botão de perfil: avatar do usuário (foto do Google ou inicial do
/// nome) com menu — informações da conta, alternância de tema e sair.
class UserMenuButton extends StatelessWidget {
  const UserMenuButton({super.key});

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthController>().user;
    final theme = context.watch<ThemeController>();
    return PopupMenuButton<String>(
      tooltip: 'Conta (${user?.email ?? ''})',
      offset: const Offset(0, 44),
      icon: _UserAvatar(user: user),
      onSelected: (value) {
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
    return CircleAvatar(
      radius: radius,
      backgroundImage: url != null && url.isNotEmpty ? NetworkImage(url) : null,
      child: url == null || url.isEmpty ? Text(initial) : null,
    );
  }
}
