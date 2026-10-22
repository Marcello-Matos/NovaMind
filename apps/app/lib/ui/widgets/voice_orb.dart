import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

/// Núcleo visual da assistente ("reactor" com cérebro neon).
///
/// Sempre animado: feixe de luz varrendo o anel, barras de áudio
/// ondulando em volta e pulsação suave. Durante a captura de voz as
/// barras sobem e o núcleo cresce/brilha conforme [level] (0..1).
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
        final t = _ticker.value * math.pi * 2 * 4; // ~4 voltas/12s de varredura
        _smooth += (widget.level.value - _smooth) * 0.15;
        final lv = _smooth;
        final scale = 1 + 0.025 * math.sin(t * 0.7) + lv * 0.10;
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
            child: Stack(
              fit: StackFit.expand,
              children: [
                // Imagem circular no miolo (78%): sobra margem para as
                // barras de áudio dançarem fora dela sem serem cortadas.
                Center(
                  child: SizedBox(
                    width: widget.size * 0.78,
                    height: widget.size * 0.78,
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
                            angle: t * 0.4,
                            child: DecoratedBox(
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                gradient: SweepGradient(
                                  colors: [
                                    Colors.transparent,
                                    Colors.white
                                        .withValues(alpha: 0.10 + lv * 0.15),
                                    Colors.transparent,
                                    primary
                                        .withValues(alpha: 0.10 + lv * 0.20),
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
                ),
                // Barras de áudio ao redor: ondulam sempre e sobem com a voz.
                CustomPaint(
                  painter: _WaveRingPainter(t: t, level: lv, color: primary),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

/// Anel de barras tipo visualizador de áudio: cada barra oscila numa
/// fase própria (movimento constante) e sua altura cresce com [level].
class _WaveRingPainter extends CustomPainter {
  final double t;
  final double level;
  final Color color;

  _WaveRingPainter({required this.t, required this.level, required this.color});

  static const _bars = 60;

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final rIn = size.width * 0.41; // logo fora da imagem (raio ~0.39)
    final paint = Paint()
      ..strokeCap = StrokeCap.round
      ..strokeWidth = size.width * 0.012;

    for (var i = 0; i < _bars; i++) {
      final angle = (i / _bars) * math.pi * 2 - math.pi / 2;
      // Onda ambiente (sempre animada) + pico com a voz, por fase da barra.
      final wave = 0.5 +
          0.5 *
              math.sin(t * 1.9 + i * 0.72 + 0.6 * math.sin(t * 0.9 + i * 0.21));
      final len = size.width * (0.012 + wave * (0.020 + level * 0.055));
      final dx = math.cos(angle);
      final dy = math.sin(angle);
      paint.color = color.withValues(
        alpha: (0.22 + level * 0.45 + wave * 0.18).clamp(0.15, 0.9),
      );
      canvas.drawLine(
        Offset(center.dx + dx * rIn, center.dy + dy * rIn),
        Offset(center.dx + dx * (rIn + len), center.dy + dy * (rIn + len)),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(_WaveRingPainter old) =>
      old.t != t || old.level != level || old.color != color;
}
