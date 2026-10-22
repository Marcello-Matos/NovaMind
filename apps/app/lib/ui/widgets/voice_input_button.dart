import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:speech_to_text/speech_recognition_error.dart';
import 'package:speech_to_text/speech_recognition_result.dart';
import 'package:speech_to_text/speech_to_text.dart';

/// Microfone do chat com reconhecimento de voz no próprio aparelho
/// (iOS Speech / Android SpeechRecognizer / Web Speech API), em pt-BR.
///
/// - Segurar: fala enquanto segura, envia ao soltar.
/// - Tocar: começa a ouvir; tocar de novo envia.
///
/// [onPartial] recebe a transcrição ao vivo (exibida no campo de texto);
/// [onFinished] recebe o texto final para envio ao assistente.
/// [onLevelChanged] reporta o volume da voz (0..1) para animar o orb;
/// [onListeningChanged] avisa quando a captura começa/termina.
class VoiceInputButton extends StatefulWidget {
  final ValueChanged<String> onPartial;
  final ValueChanged<String> onFinished;
  final ValueChanged<double>? onLevelChanged;
  final ValueChanged<bool>? onListeningChanged;
  final bool enabled;

  const VoiceInputButton({
    super.key,
    required this.onPartial,
    required this.onFinished,
    this.onLevelChanged,
    this.onListeningChanged,
    this.enabled = true,
  });

  @override
  State<VoiceInputButton> createState() => VoiceInputButtonState();
}

class VoiceInputButtonState extends State<VoiceInputButton> {
  final _speech = SpeechToText();
  bool _initialized = false;
  bool _listening = false;
  /// Só repassa resultados da sessão atual — evita que o reconhecedor
  /// reescreva o campo depois que a mensagem já foi enviada.
  bool _accepting = false;
  bool _stopping = false;
  String? _localeId;
  String _text = '';
  Completer<void>? _finalResult;
  // Energia para o orb: nível real do mic (quando o SO reporta) somado à
  // atividade de fala — no iOS o nível não chega, mas resultados parciais
  // chegam a cada trecho falado e é isso que faz o orb reagir.
  double _micLevel = 0;
  double _speechActivity = 0;
  Timer? _activityDecay;

  void _emitLevel() {
    widget.onLevelChanged?.call(math.max(_micLevel, _speechActivity));
  }

  void _setListening(bool value) {
    _listening = value;
    widget.onListeningChanged?.call(value);
    if (!value) {
      _micLevel = 0;
      _speechActivity = 0;
      _activityDecay?.cancel();
      _activityDecay = null;
      widget.onLevelChanged?.call(0);
    }
  }

  /// Interrompe a escuta descartando o texto (ex.: usuário tocou em Enviar).
  Future<void> cancel() async {
    if (!_listening && !_accepting) return;
    _accepting = false;
    _text = '';
    _finalResult?.complete();
    _finalResult = null;
    await _speech.cancel();
    if (mounted) setState(() => _setListening(false));
  }

  @override
  void dispose() {
    _speech.cancel();
    super.dispose();
  }

  void _snack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  /// Pede permissão de microfone/reconhecimento na primeira vez e escolhe
  /// o idioma português (preferindo pt-BR) entre os disponíveis.
  Future<bool> _ensureInitialized() async {
    if (_initialized) return true;
    final ok = await _speech.initialize(
      onError: _onError,
      onStatus: (status) {
        // Parou sozinho (silêncio/limite de tempo): envia o que ouviu.
        if ((status == SpeechToText.doneStatus ||
                status == SpeechToText.notListeningStatus) &&
            _accepting) {
          _stopAndSend();
        }
      },
    );
    if (!ok) {
      _snack(
        'Reconhecimento de voz indisponível. Verifique as permissões de '
        'microfone e reconhecimento de fala nos Ajustes.',
      );
      return false;
    }
    final locales = await _speech.locales();
    String norm(String id) => id.replaceAll('-', '_').toLowerCase();
    _localeId = locales
            .where((l) => norm(l.localeId) == 'pt_br')
            .map((l) => l.localeId)
            .firstOrNull ??
        locales
            .where((l) => norm(l.localeId).startsWith('pt'))
            .map((l) => l.localeId)
            .firstOrNull;
    _initialized = true;
    return true;
  }

  void _onError(SpeechRecognitionError error) {
    if (_finalResult?.isCompleted == false) _finalResult?.complete();
    if (!_accepting) return;
    // Erro encerra a sessão: libera o botão para uma nova tentativa.
    _accepting = false;
    _finalResult = null;
    _text = '';
    if (!mounted) return;
    setState(() => _setListening(false));
    // "no match"/"speech timeout" = não ouviu nada; não é falha do sistema.
    if (error.errorMsg.contains('no_match') ||
        error.errorMsg.contains('speech_timeout')) {
      _snack('Não entendi. Tente falar mais perto do microfone.');
    } else if (error.permanent) {
      _snack('Falha no reconhecimento de voz (${error.errorMsg}).');
    }
  }

  void _onResult(SpeechRecognitionResult result) {
    if (!_accepting) return;
    _text = result.recognizedWords;
    widget.onPartial(_text);
    // Cada trecho reconhecido = voz ativa; decai ~450ms após a última
    // atualização para acompanhar pausas naturais da fala.
    _speechActivity = 0.75;
    _activityDecay?.cancel();
    _activityDecay = Timer(const Duration(milliseconds: 450), () {
      _speechActivity = 0;
      _emitLevel();
    });
    _emitLevel();
    if (result.finalResult && _finalResult?.isCompleted == false) {
      _finalResult?.complete();
    }
  }

  Future<void> _start() async {
    if (_listening || _finalResult != null || !widget.enabled) return;
    if (!await _ensureInitialized()) return;
    _text = '';
    _accepting = true;
    _finalResult = Completer<void>();
    setState(() => _setListening(true));
    await _speech.listen(
      onResult: _onResult,
      // dB do microfone (~-2..10) normalizado; em plataformas que não
      // reportam (iOS) a atividade de fala cobre a animação.
      onSoundLevelChange: (level) {
        _micLevel = ((level + 2) / 12).clamp(0.0, 1.0);
        _emitLevel();
      },
      listenOptions: SpeechListenOptions(
        localeId: _localeId,
        listenFor: const Duration(minutes: 1),
        pauseFor: const Duration(seconds: 5),
        partialResults: true,
        listenMode: ListenMode.dictation,
        cancelOnError: true,
      ),
    );
  }

  Future<void> _stopAndSend() async {
    // Soltar o botão e o fim por silêncio podem chegar juntos: envia uma vez.
    if (!_accepting || _stopping) return;
    _stopping = true;
    try {
      await _speech.stop();
      // O resultado final chega logo após o stop; aguarda brevemente.
      await _finalResult?.future.timeout(
        const Duration(milliseconds: 1500),
        onTimeout: () {},
      );
      if (!_accepting) return; // cancelado enquanto aguardava
      _accepting = false;
      _finalResult = null;
      if (mounted) setState(() => _setListening(false));
      final text = _text.trim();
      _text = '';
      if (text.isNotEmpty) widget.onFinished(text);
    } finally {
      _stopping = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Tooltip(
      message: _listening
          ? 'Ouvindo… solte (ou toque) para enviar'
          : 'Segure para falar',
      child: GestureDetector(
        onLongPressStart: (_) => _start(),
        onLongPressEnd: (_) => _stopAndSend(),
        child: IconButton.filledTonal(
          onPressed: !widget.enabled
              ? null
              : () => _accepting ? _stopAndSend() : _start(),
          style: _listening
              ? IconButton.styleFrom(
                  backgroundColor: theme.colorScheme.error,
                  foregroundColor: theme.colorScheme.onError,
                )
              : null,
          icon: Icon(_listening ? Icons.stop_rounded : Icons.mic_none_rounded),
        ),
      ),
    );
  }
}
