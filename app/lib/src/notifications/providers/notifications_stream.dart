import 'dart:async';
import 'dart:convert';

import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:web_socket_channel/io.dart';

import '../../../core/instances/api_client.dart';
import '../../shared/providers/pairing_provider.dart';
import '../models/app_notification.dart';
import '../models/notifications_state.dart';

part 'notifications_stream.g.dart';

/// Global notifications inbox (S3-05). Loads recent notifications once (GET /notifications),
/// then live-tails `WS /notifications/stream?since=<seq>` and reconnects on drop. keepAlive so
/// the unread badge stays live across screens; self-contained (no external push service).
@Riverpod(keepAlive: true)
class NotificationsStream extends _$NotificationsStream {
  IOWebSocketChannel? _channel;
  StreamSubscription<dynamic>? _sub;
  Timer? _retry;
  int _lastSeq = 0;
  bool _disposed = false;
  final List<AppNotification> _items = []; // newest-first

  @override
  NotificationsState build() {
    ref.onDispose(_dispose);
    Future.microtask(_init);
    return NotificationsState.initial();
  }

  Future<void> _init() async {
    await _loadRecent();
    _connect();
  }

  void _dispose() {
    _disposed = true;
    _retry?.cancel();
    _sub?.cancel();
    _channel?.sink.close();
  }

  Future<void> _loadRecent() async {
    try {
      final dio = ref.read(apiProvider);
      final res = await dio.get<dynamic>('/notifications');
      final list = (res.data['notifications'] as List)
          .cast<Map<String, dynamic>>()
          .map(AppNotification.fromJson)
          .toList();
      _items
        ..clear()
        ..addAll(list); // already newest-first from the daemon
      _lastSeq = _items.isNotEmpty ? _items.first.seq : 0;
      state = state.copyWith(
        items: List.unmodifiable(_items),
        unread:
            (res.data['unread'] as int?) ?? _items.where((n) => !n.read).length,
      );
    } catch (_) {
      // Offline — the WS will reconnect and replay.
    }
  }

  void _connect() {
    if (_disposed) return;
    final pairing = ref.read(pairingProvider).value;
    if (pairing == null) return;
    final wsBase =
        pairing.baseUrl.replaceFirst('http', 'ws'); // http->ws, https->wss
    final uri = Uri.parse('$wsBase/notifications/stream?since=$_lastSeq');
    try {
      _channel = IOWebSocketChannel.connect(
        uri,
        headers: {'Authorization': 'Bearer ${pairing.token}'},
      );
    } catch (_) {
      _scheduleReconnect();
      return;
    }
    state = state.copyWith(connected: true);
    _sub = _channel!.stream.listen(
      _onMessage,
      onError: (_) => _onDisconnect(),
      onDone: _onDisconnect,
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
    // Control frame (stream.caughtup / stream.error) — ignore.
    if (map['type'] != null) return;
    final seq = map['seq'] as int?;
    if (seq == null) return;
    final n = AppNotification.fromJson(map);
    _items.insert(0, n); // newest-first
    if (_items.length > 200) _items.removeRange(200, _items.length);
    if (seq > _lastSeq) _lastSeq = seq;
    state = state.copyWith(
      items: List.unmodifiable(_items),
      unread: n.read ? state.unread : state.unread + 1,
    );
  }

  void _onDisconnect() {
    _sub?.cancel();
    _channel = null;
    if (_disposed) return;
    state = state.copyWith(connected: false);
    _scheduleReconnect();
  }

  void _scheduleReconnect() {
    _retry?.cancel();
    _retry = Timer(const Duration(seconds: 3), () {
      if (!_disposed) _connect();
    });
  }

  /// Mark everything currently shown as read (POST /notifications/read). Optimistic.
  Future<void> markAllRead() async {
    if (_items.isEmpty) return;
    final top = _items.first.seq;
    for (var i = 0; i < _items.length; i++) {
      if (!_items[i].read) _items[i] = _items[i].copyWith(read: true);
    }
    state = state.copyWith(items: List.unmodifiable(_items), unread: 0);
    try {
      await ref.read(apiProvider).post<dynamic>(
        '/notifications/read',
        data: {'upTo': top},
      );
    } catch (_) {
      // Non-fatal; the daemon stays the source of truth on next load.
    }
  }
}
