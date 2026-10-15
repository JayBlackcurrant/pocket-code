/// How a run-session log line should be rendered.
enum RunLineKind { log, lifecycle, reload, error, success }

/// One rendered line in the run log, derived from a daemon run event (S5-05).
class RunLine {
  const RunLine({required this.seq, required this.kind, required this.text});

  final int seq;
  final RunLineKind kind;
  final String text;
}

/// Run status implied by a lifecycle event, or null if none (S5-03).
/// starting | running | reloading | stopped | failed
String? runStatusFromEvent(String type, dynamic payload) {
  switch (type) {
    case 'run.created':
      return 'starting';
    case 'run.started':
      return 'running';
    case 'run.reload':
    case 'run.restart':
    case 'run.autoreload':
      return 'reloading';
    case 'run.reloaded':
    case 'run.restarted':
    case 'run.reload_failed':
    case 'run.restart_failed':
      return 'running';
    case 'run.stopped':
      return 'stopped';
    case 'run.error':
      return 'failed';
    default:
      return null;
  }
}

/// The Dart VM service URI from a debugPort event, if present (S5-02).
String? debugUriFromEvent(String type, dynamic payload) {
  if (type == 'run.debugPort' && payload is Map) {
    final ws = payload['wsUri'];
    final base = payload['baseUri'];
    if (ws is String && ws.isNotEmpty) return ws;
    if (base is String && base.isNotEmpty) return base;
  }
  return null;
}

/// Map a daemon run event (type + payload) to zero or one log line. Pure + testable.
RunLine? mapRunEvent(int seq, String type, dynamic payload) {
  final p = payload is Map ? payload : const {};
  String msg(String fallback) {
    final m = p['message']?.toString();
    return (m != null && m.isNotEmpty) ? m : fallback;
  }

  switch (type) {
    case 'run.log':
      return RunLine(seq: seq, kind: RunLineKind.log, text: p['line']?.toString() ?? '');
    case 'run.progress':
      final message = p['message']?.toString() ?? '';
      if (message.isEmpty) return null;
      return RunLine(seq: seq, kind: RunLineKind.lifecycle, text: message);
    case 'run.started':
      return RunLine(seq: seq, kind: RunLineKind.success, text: 'App started');
    case 'run.reload':
      return RunLine(seq: seq, kind: RunLineKind.reload, text: '↻ Hot reloading…');
    case 'run.restart':
      return RunLine(seq: seq, kind: RunLineKind.reload, text: '⟳ Hot restarting…');
    case 'run.autoreload':
      return RunLine(seq: seq, kind: RunLineKind.reload, text: '↻ Auto-reloading after edit…');
    case 'run.reloaded':
      return RunLine(seq: seq, kind: RunLineKind.success, text: msg('Reloaded'));
    case 'run.restarted':
      return RunLine(seq: seq, kind: RunLineKind.success, text: msg('Restarted'));
    case 'run.reload_failed':
      return RunLine(seq: seq, kind: RunLineKind.error, text: 'Reload failed: ${msg('see log')}');
    case 'run.restart_failed':
      return RunLine(seq: seq, kind: RunLineKind.error, text: 'Restart failed: ${msg('see log')}');
    case 'run.stopping':
      return RunLine(seq: seq, kind: RunLineKind.lifecycle, text: 'Stopping…');
    case 'run.stopped':
      return RunLine(seq: seq, kind: RunLineKind.lifecycle, text: 'Stopped');
    case 'run.error':
      return RunLine(seq: seq, kind: RunLineKind.error, text: p['reason']?.toString() ?? 'run failed');
    default:
      // run.created, run.debugPort carry no user-facing line.
      return null;
  }
}
