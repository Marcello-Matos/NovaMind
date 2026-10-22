import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

/// Anel de partículas que representa a assistente "viva".
///
/// Em repouso respira suavemente; durante a captura de voz o anel se
/// movimenta com o volume da fala ([level] 0..1, vindo do microfone).
class VoiceOrb extends StatefulWidget {
  final ValueListenable<double> level;
  final double size;

  const VoiceOrb({super.key, required this.level, this.size = 180});

  @override
  State<VoiceOrb> createState() => _VoiceOrbState();
}

class _VoiceOrbState extends State<VoiceOrb>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ticker;

  @override
  void initState() {
    super.initState();
    _ticker = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 10),
    )..repeat();
  }

  @override
  void dispose() {
    _ticker.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final primary = Theme.of(context).colorScheme.primary;
    return SizedBox(
      width: widget.size,
      height: widget.size,
      child: CustomPaint(
        painter: _OrbPainter(
          ticker: _ticker,
          level: widget.level,
          color: primary,
        ),
      ),
    );
  }
}

class _OrbPainter extends CustomPainter {
  final AnimationController ticker;
  final ValueListenable<double> level;
  final Color color;
  double _smooth = 0;

  _OrbPainter({
    required this.ticker,
    required this.level,
    required this.color,
  }) : super(repaint: ticker);

  static const _count = 130;

  @override
  void paint(Canvas canvas, Size size) {
    final t = ticker.value * 10; // segundos
    _smooth += (level.value - _smooth) * 0.12;
    final lv = _smooth;

    final center = size.center(Offset.zero);
    final r = size.width * 0.34;
    final rng = math.Random(7);
    final seeds = List.generate(_count, (i) => rng.nextDouble() * math.pi * 2);

    // Halo interno suave.
    canvas.drawCircle(
      center,
      r * (0.55 + lv * 0.25),
      Paint()
        ..color = color.withValues(alpha: 0.05 + lv * 0.10)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 18),
    );

    // Anel externo quase invisível.
    canvas.drawCircle(
      center,
      r * (1.18 + lv * 0.10),
      Paint()
        ..color = color.withValues(alpha: 0.10 + lv * 0.15)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 0.8,
    );

    // Partículas do anel: respiram devagar e reagem ao volume da voz.
    for (var i = 0; i < _count; i++) {
      final seed = seeds[i];
      final angle = (i / _count) * math.pi * 2 + t * 0.18 + seed * 0.15;
      final breath = math.sin(t * 1.2 + seed * 3) * r * 0.045;
      final voice = math.sin(t * 4.2 + seed * 7) * r * 0.20 * lv;
      final radius = r + breath + voice + lv * r * 0.06;
      final dx = center.dx + math.cos(angle) * radius;
      final dy = center.dy + math.sin(angle) * radius;
      final dot = 1.1 + 0.8 * (0.5 + 0.5 * math.sin(t * 2 + seed * 5));
      final alpha = (0.30 + 0.45 * (0.5 + 0.5 * math.sin(seed * 9 + t)))
          .clamp(0.12, 0.9);
      canvas.drawCircle(
        Offset(dx, dy),
        dot * (1 + lv * 0.8),
        Paint()..color = color.withValues(alpha: alpha),
      );
    }

    // Núcleo: pequeno pulso central.
    canvas.drawCircle(
      center,
      size.width * 0.10 * (1 + lv * 0.5 + 0.06 * math.sin(t * 1.6)),
      Paint()
        ..color = color.withValues(alpha: 0.10 + lv * 0.15)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 10),
    );
    canvas.drawCircle(
      center,
      size.width * 0.045 * (1 + lv * 0.6),
      Paint()..color = color.withValues(alpha: 0.35 + lv * 0.4),
    );
  }

  @override
  bool shouldRepaint(_OrbPainter oldDelegate) => false;
}
