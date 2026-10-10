/// How a build log line should be rendered.
enum BuildLineKind { log, step, lifecycle, error, success }

/// One rendered line in the build log, derived from a daemon build event.
class BuildLine {
  const BuildLine({required this.seq, required this.kind, required this.text});

  final int seq;
  final BuildLineKind kind;
  final String text;
}

/// Build status implied by a lifecycle event, or null if none (S3-01/04).
String? buildStatusFromEvent(String type, dynamic payload) {
  switch (type) {
    case 'build.created':
      return 'queued';
    case 'build.started':
      return 'running';
    case 'build.completed':
      return 'succeeded';
    case 'build.error':
      return 'failed';
    case 'build.cancelled':
      return 'cancelled';
    default:
      return null;
  }
}

/// Upload status implied by an upload event, or null if none (S3-02).
String? uploadStatusFromEvent(String type, dynamic payload) {
  switch (type) {
    case 'build.upload_started':
      return 'uploading';
    case 'build.upload_completed':
      return 'uploaded';
    case 'build.upload_error':
      return 'failed';
    default:
      return null;
  }
}

/// The Firebase release URL from a completed upload, if present (S3-02).
String? releaseUrlFromEvent(String type, dynamic payload) {
  if (type == 'build.upload_completed' && payload is Map) {
    final url = payload['releaseUrl'];
    return url is String && url.isNotEmpty ? url : null;
  }
  return null;
}

/// Map a daemon build event (type + payload) to zero or one log line. Pure + testable.
BuildLine? mapBuildEvent(int seq, String type, dynamic payload) {
  final p = payload is Map ? payload : const {};
  switch (type) {
    case 'build.log':
    case 'build.upload_log':
      final line = p['line']?.toString() ?? '';
      return BuildLine(seq: seq, kind: BuildLineKind.log, text: line);
    case 'build.step':
      final i = p['index'];
      final total = p['total'];
      final cmd = p['command']?.toString() ?? '';
      final n = (i is int ? i + 1 : i)?.toString() ?? '?';
      return BuildLine(
          seq: seq, kind: BuildLineKind.step, text: '▶ step $n/$total · $cmd');
    case 'build.started':
      return BuildLine(
          seq: seq, kind: BuildLineKind.lifecycle, text: 'Build started');
    case 'build.completed':
      return BuildLine(
          seq: seq, kind: BuildLineKind.success, text: 'Build succeeded');
    case 'build.error':
      final reason = p['reason']?.toString() ?? 'build failed';
      return BuildLine(seq: seq, kind: BuildLineKind.error, text: reason);
    case 'build.cancelled':
      return BuildLine(
          seq: seq, kind: BuildLineKind.lifecycle, text: 'Build cancelled');
    case 'build.upload_started':
      return BuildLine(
          seq: seq,
          kind: BuildLineKind.lifecycle,
          text: 'Uploading to Firebase…');
    case 'build.upload_completed':
      return BuildLine(
          seq: seq, kind: BuildLineKind.success, text: 'Uploaded to testers');
    case 'build.upload_error':
      final reason = p['reason']?.toString() ?? 'upload failed';
      return BuildLine(seq: seq, kind: BuildLineKind.error, text: reason);
    default:
      // build.created and others carry no user-facing line.
      return null;
  }
}
