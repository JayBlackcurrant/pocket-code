import '../task_feed.dart';

/// UI state for the live task stream.
class TaskStreamState {
  const TaskStreamState({
    required this.items,
    required this.status,
    required this.connected,
    required this.caughtUp,
    this.error,
  });

  final List<FeedItem> items;
  final String status;
  final bool connected;
  final bool caughtUp;
  final String? error;

  factory TaskStreamState.initial() => const TaskStreamState(
        items: [],
        status: 'connecting',
        connected: false,
        caughtUp: false,
      );

  bool get isRunning =>
      status == 'running' || status == 'queued' || status == 'waiting';

  bool get isTerminal =>
      status == 'done' || status == 'failed' || status == 'cancelled';

  TaskStreamState copyWith({
    List<FeedItem>? items,
    String? status,
    bool? connected,
    bool? caughtUp,
    String? error,
    bool clearError = false,
  }) {
    return TaskStreamState(
      items: items ?? this.items,
      status: status ?? this.status,
      connected: connected ?? this.connected,
      caughtUp: caughtUp ?? this.caughtUp,
      error: clearError ? null : (error ?? this.error),
    );
  }
}
