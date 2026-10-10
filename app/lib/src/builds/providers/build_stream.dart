import 'dart:async';
import 'dart:convert';

import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:web_socket_channel/io.dart';

import '../../shared/providers/pairing_provider.dart';
import '../build_feed.dart';
import '../models/build_stream_state.dart';

part 'build_stream.g.dart';

/// Connects to `WS /builds/:id/stream?since=<seq>`, replays missed log lines then
/// live-tails, and reconnects (from the last seen seq) on drop — same replay contract as
/// the task stream (S1-06), so no log output is lost across a disconnect.
@riverpod
class BuildStream extends _$BuildStream {
  IOWebSocketChannel? _channel;
  StreamSubscription<dynamic>? _sub;
  Timer? _retry;
  int _lastSeq = 0;
  bool _disposed = false;
  final List<BuildLine> _lines = [];

  @override
  BuildStreamState build(String buildId) {
    ref.onDispose(_dispose);
    Future.microtask(() => _connect(buildId));
    return BuildStreamState.initial();
  }

  void _dispose() {
    _disposed = true;
    _retry?.cancel();
    _sub?.cancel();
    _channel?.sink.close();
  }

  void _connect(String buildId) {
    if (_disposed) return;
    final pairing = ref.read(pairingProvider).value;
    if (pairing == null) {
      state = state.copyWith(error: 'Not paired', connected: false);
      return;
    }
    final wsBase =
        pairing.baseUrl.replaceFirst('http', 'ws'); // http->ws, https->wss
    final uri = Uri.parse('$wsBase/builds/$buildId/stream?since=$_lastSeq');
    try {
      _channel = IOWebSocketChannel.connect(
        uri,
        headers: {'Authorization': 'Bearer ${pairing.token}'},
      );
    } catch (_) {
      _scheduleReconnect(buildId);
      return;
    }
    state = state.copyWith(connected: true, caughtUp: false, clearError: true);
    _sub = _channel!.stream.listen(
      _onMessage,
      onError: (_) => _onDisconnect(buildId),
      onDone: () => _onDisconnect(buildId),
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
    final line = mapBuildEvent(seq, type ?? '', payload);
    if (line != null) {
      _lines.add(line);
      if (_lines.length > 2000) _lines.removeRange(0, _lines.length - 2000);
    }
    state = state.copyWith(
      lines: List.unmodifiable(_lines),
      status: buildStatusFromEvent(type ?? '', payload) ?? state.status,
      uploadStatus:
          uploadStatusFromEvent(type ?? '', payload) ?? state.uploadStatus,
      releaseUrl: releaseUrlFromEvent(type ?? '', payload) ?? state.releaseUrl,
    );
  }

  void _onDisconnect(String buildId) {
    _sub?.cancel();
    _channel = null;
    if (_disposed) return;
    state = state.copyWith(connected: false);
    _scheduleReconnect(buildId);
  }

  void _scheduleReconnect(String buildId) {
    _retry?.cancel();
    _retry = Timer(const Duration(seconds: 2), () {
      if (!_disposed) _connect(buildId);
    });
  }
}
