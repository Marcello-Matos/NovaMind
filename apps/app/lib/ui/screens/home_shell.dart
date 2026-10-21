import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/auth_controller.dart';
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
            Padding(
              padding: const EdgeInsets.only(right: 12),
              child: SizedBox(width: 150, child: orgSelector),
            ),
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
            trailing: Expanded(
              child: Align(
                alignment: Alignment.bottomCenter,
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: IconButton(
                    tooltip: 'Sair (${auth.user?.email ?? ''})',
                    icon: const Icon(Icons.logout),
                    onPressed: auth.logout,
                  ),
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
