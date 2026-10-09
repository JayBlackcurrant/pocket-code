import 'dart:convert';

/// How a feed item should be rendered in the task stream.
enum FeedKind { assistant, tool, result, lifecycle, error, info }

/// One rendered line/card derived from a daemon event.
class FeedItem {
  const FeedItem({
    required this.seq,
    required this.kind,
    required this.title,
    this.body,
  });

  final int seq;
  final FeedKind kind;
  final String title;
  final String? body;
}

/// Terminal/transition status implied by a lifecycle event, or null if none.
String? statusFromEvent(String type, dynamic payload) {
  switch (type) {
    case 'task.started':
      return 'running';
    case 'task.completed':
      return (payload is Map ? payload['status'] as String? : null) ?? 'done';
    case 'task.cancelled':
      return 'cancelled';
    case 'task.error':
      return 'failed';
    default:
      return null;
  }
}

/// Map a daemon event (type + payload) to zero or more display items. Pure +
/// testable: no socket/provider involved.
List<FeedItem> mapEventToItems(int seq, String type, dynamic payload) {
  switch (type) {
    case 'agent.assistant':
      return _assistantItems(seq, payload);
    case 'agent.result.success':
      final text = payload is Map ? payload['result']?.toString() : null;
      return [
        FeedItem(seq: seq, kind: FeedKind.result, title: 'Result', body: text)
      ];
    case 'task.started':
      final branch = payload is Map ? payload['branch']?.toString() : null;
      return [
        FeedItem(
            seq: seq,
            kind: FeedKind.lifecycle,
            title: 'Task started',
            body: branch),
      ];
    case 'task.completed':
      final status = payload is Map ? payload['status'] : null;
      final cost = payload is Map ? payload['costUsd'] : null;
      return [
        FeedItem(
          seq: seq,
          kind: FeedKind.lifecycle,
          title: 'Task ${status ?? 'done'}',
          body: cost != null ? 'Cost: \$$cost' : null,
        ),
      ];
    case 'task.cancelled':
      return [
        FeedItem(seq: seq, kind: FeedKind.lifecycle, title: 'Task cancelled')
      ];
    case 'task.error':
      final msg = payload is Map ? payload['message']?.toString() : null;
      return [
        FeedItem(seq: seq, kind: FeedKind.error, title: 'Error', body: msg)
      ];
    default:
      return const [];
  }
}

List<FeedItem> _assistantItems(int seq, dynamic payload) {
  final out = <FeedItem>[];
  final message = payload is Map ? payload['message'] : null;
  final content = message is Map ? message['content'] : null;

  if (content is List) {
    final text = StringBuffer();
    for (final block in content) {
      if (block is! Map) continue;
      switch (block['type']) {
        case 'text':
          text.write(block['text'] ?? '');
        case 'tool_use':
          out.add(FeedItem(
            seq: seq,
            kind: FeedKind.tool,
            title: 'Tool · ${block['name']}',
            body: _shortJson(block['input']),
          ));
      }
    }
    final joined = text.toString().trim();
    if (joined.isNotEmpty) {
      out.insert(
          0,
          FeedItem(
              seq: seq,
              kind: FeedKind.assistant,
              title: 'Claude',
              body: joined));
    }
  } else if (content is String && content.trim().isNotEmpty) {
    out.add(FeedItem(
        seq: seq, kind: FeedKind.assistant, title: 'Claude', body: content));
  }
  return out;
}

String? _shortJson(dynamic input) {
  if (input == null) return null;
  var s = input is String ? input : jsonEncode(input);
  if (s.length > 300) s = '${s.substring(0, 300)}…';
  return s;
}
