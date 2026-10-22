import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

/// Núcleo visual da assistente ("reactor" com cérebro neon).
///
/// Em repouso respira com uma leve pulsação e um feixe de luz varrendo o
/// anel; durante a captura de voz cresce e ganha brilho conforme o volume
/// da fala ([level] 0..1, vindo do microfone).
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
  double _smooth = 0;

  @override
  void initState() {
    super.initState();
    _ticker = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 12),
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
    return AnimatedBuilder(
      animation: _ticker,
      builder: (context, _) {
        final t = _ticker.value * math.pi * 2;
        _smooth += (widget.level.value - _smooth) * 0.12;
        final lv = _smooth;
        // Respiração lenta + crescimento com a voz.
        final scale = 1 + 0.03 * math.sin(t * 0.8) + lv * 0.10;
        return Transform.scale(
          scale: scale,
          child: Container(
            width: widget.size,
            height: widget.size,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: primary.withValues(alpha: 0.35 + lv * 0.35),
                  blurRadius: 26 + lv * 34,
                  spreadRadius: 2 + lv * 6,
                ),
              ],
            ),
            child: ClipOval(
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Image.asset(
                    'assets/images/ai_orb.jpg',
                    fit: BoxFit.cover,
                  ),
                  // Feixe de luz cônico girando sobre o anel.
                  Transform.rotate(
                    angle: t * 0.35,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: SweepGradient(
                          colors: [
                            Colors.transparent,
                            Colors.white.withValues(alpha: 0.10 + lv * 0.15),
                            Colors.transparent,
                            primary.withValues(alpha: 0.10 + lv * 0.20),
                            Colors.transparent,
                          ],
                          stops: const [0.0, 0.12, 0.35, 0.6, 1.0],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
