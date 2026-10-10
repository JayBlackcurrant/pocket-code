import 'dart:async';
import 'dart:convert';

import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:web_socket_channel/io.dart';

import '../../../core/instances/api_client.dart';
import '../../shared/providers/pairing_provider.dart';
import '../models/pending_approval.dart';
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
  late String _taskId;
  final List<FeedItem> _items = [];
  final List<PendingApproval> _pending = [];
  final Set<String> _autoAllow = {}; // tool names "always allowed" this session

  @override
  TaskStreamState build(String taskId) {
    _taskId = taskId;
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
    _applyPermission(type ?? '', map['payload']);
    state = state.copyWith(
      items: List.unmodifiable(_items),
      pending: List.unmodifiable(_pending),
      status: statusFromEvent(type ?? '', map['payload']) ?? state.status,
    );
  }

  /// Fold permission events into the pending list (S2-04).
  void _applyPermission(String type, dynamic payload) {
    if (type == 'agent.permission_request') {
      final p = payload is Map ? payload : const {};
      final toolUseId = p['toolUseId']?.toString();
      if (toolUseId == null) return;
      final toolName = (p['toolName'] ?? 'tool').toString();
      final input = p['input'] is Map
          ? Map<String, dynamic>.from(p['input'] as Map)
          : <String, dynamic>{};
      if (_autoAllow.contains(toolName)) {
        unawaited(_send(toolUseId, allow: true));
        return;
      }
      if (!_pending.any((x) => x.toolUseId == toolUseId)) {
        _pending.add(PendingApproval(
            toolUseId: toolUseId, toolName: toolName, input: input));
      }
    } else if (type == 'agent.permission_decision' ||
        type == 'agent.permission_timeout') {
      final id = payload is Map ? payload['toolUseId']?.toString() : null;
      if (id != null) _pending.removeWhere((x) => x.toolUseId == id);
    }
  }

  /// Allow or deny a parked tool call (S2-04). Optimistically clears it locally.
  Future<void> decide(String toolUseId,
      {required bool allow, String? reason}) async {
    _pending.removeWhere((x) => x.toolUseId == toolUseId);
    state = state.copyWith(pending: List.unmodifiable(_pending));
    await _send(toolUseId, allow: allow, reason: reason);
  }

  /// Always allow a tool for the rest of this session (approves current + future ones).
  void alwaysAllow(String toolName) {
    _autoAllow.add(toolName);
    final ids = _pending
        .where((x) => x.toolName == toolName)
        .map((x) => x.toolUseId)
        .toList();
    _pending.removeWhere((x) => x.toolName == toolName);
    state = state.copyWith(pending: List.unmodifiable(_pending));
    for (final id in ids) {
      unawaited(_send(id, allow: true));
    }
  }

  Future<void> _send(String toolUseId,
      {required bool allow, String? reason}) async {
    final dio = ref.read(apiProvider);
    try {
      await dio.post<dynamic>(
        '/tasks/$_taskId/permissions/$toolUseId',
        data: {
          'decision': allow ? 'allow' : 'deny',
          if (reason != null && reason.isNotEmpty) 'reason': reason,
        },
      );
    } catch (_) {
      // Surfaced via the stream; ignore the HTTP-level failure here.
    }
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
