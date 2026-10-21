import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../state/auth_controller.dart';

class UsageScreen extends StatefulWidget {
  const UsageScreen({super.key});

  @override
  State<UsageScreen> createState() => _UsageScreenState();
}

class _UsageScreenState extends State<UsageScreen> {
  UsageSummary? _summary;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      try {
        final s = await context.read<AuthController>().api.usageSummary();
        if (mounted) setState(() => _summary = s);
      } catch (_) {}
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 720),
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Uso e plano', style: theme.textTheme.headlineSmall),
              const SizedBox(height: 4),
              Text(
                'Transparência de consumo — custos estimados de IA.',
                style: TextStyle(color: theme.hintColor),
              ),
              const SizedBox(height: 24),
              Wrap(
                spacing: 16,
                runSpacing: 16,
                children: [
                  _Card(
                    title: 'Plano atual',
                    value: 'Gratuito',
                    subtitle:
                        'Upgrade disponível na fase de monetização.',
                  ),
                  _Card(
                    title: 'Custo estimado (mês)',
                    value:
                        'US\$ ${(_summary?.monthCostUsd ?? 0).toStringAsFixed(4)}',
                    subtitle:
                        '${_summary?.monthEvents ?? 0} eventos · ${_summary?.monthTokens ?? 0} tokens',
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Card extends StatelessWidget {
  final String title;
  final String value;
  final String subtitle;

  const _Card({
    required this.title,
    required this.value,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SizedBox(
      width: 280,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title.toUpperCase(),
                  style: theme.textTheme.labelSmall
                      ?.copyWith(color: theme.hintColor)),
              const SizedBox(height: 8),
              Text(value, style: theme.textTheme.headlineSmall),
              const SizedBox(height: 4),
              Text(subtitle,
                  style:
                      theme.textTheme.bodySmall?.copyWith(color: theme.hintColor)),
            ],
          ),
        ),
      ),
    );
  }
}
