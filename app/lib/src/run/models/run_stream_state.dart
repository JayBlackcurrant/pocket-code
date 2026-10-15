import '../run_feed.dart';

/// UI state for a live run-session log stream (S5-09).
class RunStreamState {
  const RunStreamState({
    required this.lines,
    required this.status,
    required this.connected,
    required this.caughtUp,
    this.debugUri,
    this.error,
  });

  final List<RunLine> lines;

  /// connecting | starting | running | reloading | stopped | failed
  final String status;
  final bool connected;
  final bool caughtUp;
  final String? debugUri;
  final String? error;

  factory RunStreamState.initial() => const RunStreamState(
        lines: [],
        status: 'connecting',
        connected: false,
        caughtUp: false,
      );

  bool get running => status == 'running';
  bool get reloading => status == 'reloading';
  bool get starting => status == 'starting' || status == 'connecting';
  bool get stopped => status == 'stopped';
  bool get failed => status == 'failed';

  RunStreamState copyWith({
    List<RunLine>? lines,
    String? status,
    bool? connected,
    bool? caughtUp,
    String? debugUri,
    String? error,
    bool clearError = false,
  }) {
    return RunStreamState(
      lines: lines ?? this.lines,
      status: status ?? this.status,
      connected: connected ?? this.connected,
      caughtUp: caughtUp ?? this.caughtUp,
      debugUri: debugUri ?? this.debugUri,
      error: clearError ? null : (error ?? this.error),
    );
  }
}
