import 'dart:async';
import 'dart:convert';

import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:web_socket_channel/io.dart';

import '../../../core/instances/api_client.dart';
import '../../shared/providers/pairing_provider.dart';
import '../models/task_stream_state.dart';
import '../task_feed.dart';

part 'task_stream.g.dart';

/// Connects to `WS /tasks/:id/stream?since=<seq>`, replays missed events then live-tails,
/// and reconnects (from the last seen seq) on drop — mirrors the daemon's replay
/// contract so no output is lost across a disconnect (S1-06 ↔ S1-10).
@riverpod
class TaskStream extends _$TaskStream {
  IOWebSocketChannel? _channel;
  StreamSubscription<dynamic>? _sub;
  Timer? _retry;
  int _lastSeq = 0;
  bool _disposed = false;
  final List<FeedItem> _items = [];

  @override
  TaskStreamState build(String taskId) {
    ref.onDispose(_dispose);
    // Connect AFTER build returns — _connect mutates `state`, which is not yet
    // initialized while build() is running.
    Future.microtask(() => _connect(taskId));
    return TaskStreamState.initial();
  }

  void _dispose() {
    _disposed = true;
    _retry?.cancel();
    _sub?.cancel();
    _channel?.sink.close();
  }

  void _connect(String taskId) {
    if (_disposed) return;
    final pairing = ref.read(pairingProvider).value;
    if (pairing == null) {
      state = state.copyWith(error: 'Not paired', connected: false);
      return;
    }
    // http -> ws, https -> wss.
    final wsBase = pairing.baseUrl.replaceFirst('http', 'ws');
    final uri = Uri.parse('$wsBase/tasks/$taskId/stream?since=$_lastSeq');
    try {
      _channel = IOWebSocketChannel.connect(
        uri,
        headers: {'Authorization': 'Bearer ${pairing.token}'},
      );
    } catch (_) {
      _scheduleReconnect(taskId);
      return;
    }
    state = state.copyWith(connected: true, caughtUp: false, clearError: true);
    _sub = _channel!.stream.listen(
      (data) => _onMessage(data),
      onError: (_) => _onDisconnect(taskId),
      onDone: () => _onDisconnect(taskId),
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

    final newItems = mapEventToItems(seq, type ?? '', map['payload']);
    if (newItems.isNotEmpty) {
      _items.addAll(newItems);
      if (_items.length > 1000) {
        _items.removeRange(0, _items.length - 1000);
      }
    }
    state = state.copyWith(
      items: List.unmodifiable(_items),
      status: statusFromEvent(type ?? '', map['payload']) ?? state.status,
    );
  }

  void _onDisconnect(String taskId) {
    _sub?.cancel();
    _channel = null;
    if (_disposed) return;
    state = state.copyWith(connected: false);
    if (state.isTerminal) return; // nothing more will arrive
    _scheduleReconnect(taskId);
  }

  void _scheduleReconnect(String taskId) {
    _retry?.cancel();
    _retry = Timer(const Duration(seconds: 2), () {
      if (!_disposed) _connect(taskId);
    });
  }

  /// Stop the task (POST /tasks/:id/cancel). The cancellation then arrives as an event.
  Future<void> cancel(String taskId) async {
    final dio = ref.read(apiProvider);
    try {
      await dio.post<dynamic>('/tasks/$taskId/cancel');
    } catch (_) {
      // Surfaced via the stream; ignore the HTTP-level failure here.
    }
  }
}
