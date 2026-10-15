import 'dart:async';
import 'dart:convert';

import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:web_socket_channel/io.dart';

import '../../shared/providers/pairing_provider.dart';
import '../models/run_stream_state.dart';
import '../run_feed.dart';

part 'run_stream.g.dart';

/// Connects to `WS /runs/:id/stream?since=<seq>`, replays missed log lines then live-tails, and
/// reconnects (from the last seen seq) on drop — same replay contract as the build stream (S5-05),
/// so no run output is lost across a disconnect.
@riverpod
class RunStream extends _$RunStream {
  IOWebSocketChannel? _channel;
  StreamSubscription<dynamic>? _sub;
  Timer? _retry;
  int _lastSeq = 0;
  bool _disposed = false;
  final List<RunLine> _lines = [];

  @override
  RunStreamState build(String runId) {
    ref.onDispose(_dispose);
    Future.microtask(() => _connect(runId));
    return RunStreamState.initial();
  }

  void _dispose() {
    _disposed = true;
    _retry?.cancel();
    _sub?.cancel();
    _channel?.sink.close();
  }

  void _connect(String runId) {
    if (_disposed) return;
    final pairing = ref.read(pairingProvider).value;
    if (pairing == null) {
      state = state.copyWith(error: 'Not paired', connected: false);
      return;
    }
    final wsBase = pairing.baseUrl.replaceFirst('http', 'ws'); // http->ws, https->wss
    final uri = Uri.parse('$wsBase/runs/$runId/stream?since=$_lastSeq');
    try {
      _channel = IOWebSocketChannel.connect(
        uri,
        headers: {'Authorization': 'Bearer ${pairing.token}'},
      );
    } catch (_) {
      _scheduleReconnect(runId);
      return;
    }
    state = state.copyWith(connected: true, caughtUp: false, clearError: true);
    _sub = _channel!.stream.listen(
      _onMessage,
      onError: (_) => _onDisconnect(runId),
      onDone: () => _onDisconnect(runId),
      cancelOnError: true,
    );
  }

  void _onMessage(dynamic data) {
    final Map<String, dynamic> map;
    try {
      map = jsonDecode(data as String) as Map<String, dynamic>;
    } catch (_) {
      return;
    }
    final type = map['type'] as String?;
    if (type == 'stream.caughtup') {
      state = state.copyWith(caughtUp: true);
      return;
    }
    if (type == 'stream.error') {
      state = state.copyWith(error: map['error']?.toString());
      return;
    }
    final seq = map['seq'] as int?;
    if (seq == null) return; // not an event frame
    _lastSeq = seq;

    final payload = map['payload'];
    final line = mapRunEvent(seq, type ?? '', payload);
    if (line != null) {
      _lines.add(line);
      if (_lines.length > 2000) _lines.removeRange(0, _lines.length - 2000);
    }
    state = state.copyWith(
      lines: List.unmodifiable(_lines),
      status: runStatusFromEvent(type ?? '', payload) ?? state.status,
      debugUri: debugUriFromEvent(type ?? '', payload) ?? state.debugUri,
    );
  }

  void _onDisconnect(String runId) {
    _sub?.cancel();
    _channel = null;
    if (_disposed) return;
    state = state.copyWith(connected: false);
    _scheduleReconnect(runId);
  }

  void _scheduleReconnect(String runId) {
    _retry?.cancel();
    _retry = Timer(const Duration(seconds: 2), () {
      if (!_disposed) _connect(runId);
    });
  }
}
