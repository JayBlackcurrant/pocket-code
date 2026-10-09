// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'task_stream.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// Connects to `WS /tasks/:id/stream?since=<seq>`, replays missed events then live-tails,
/// and reconnects (from the last seen seq) on drop — mirrors the daemon's replay
/// contract so no output is lost across a disconnect (S1-06 ↔ S1-10).

@ProviderFor(TaskStream)
const taskStreamProvider = TaskStreamFamily._();

/// Connects to `WS /tasks/:id/stream?since=<seq>`, replays missed events then live-tails,
/// and reconnects (from the last seen seq) on drop — mirrors the daemon's replay
/// contract so no output is lost across a disconnect (S1-06 ↔ S1-10).
final class TaskStreamProvider
    extends $NotifierProvider<TaskStream, TaskStreamState> {
  /// Connects to `WS /tasks/:id/stream?since=<seq>`, replays missed events then live-tails,
  /// and reconnects (from the last seen seq) on drop — mirrors the daemon's replay
  /// contract so no output is lost across a disconnect (S1-06 ↔ S1-10).
  const TaskStreamProvider._(
      {required TaskStreamFamily super.from, required String super.argument})
      : super(
          retry: null,
          name: r'taskStreamProvider',
          isAutoDispose: true,
          dependencies: null,
          $allTransitiveDependencies: null,
        );

  @override
  String debugGetCreateSourceHash() => _$taskStreamHash();

  @override
  String toString() {
    return r'taskStreamProvider'
        ''
        '($argument)';
  }

  @$internal
  @override
  TaskStream create() => TaskStream();

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(TaskStreamState value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<TaskStreamState>(value),
    );
  }

  @override
  bool operator ==(Object other) {
    return other is TaskStreamProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$taskStreamHash() => r'2ae3ad0bcac9b9c01a7aa22fb8f7f79cf3a434d5';

/// Connects to `WS /tasks/:id/stream?since=<seq>`, replays missed events then live-tails,
/// and reconnects (from the last seen seq) on drop — mirrors the daemon's replay
/// contract so no output is lost across a disconnect (S1-06 ↔ S1-10).

final class TaskStreamFamily extends $Family
    with
        $ClassFamilyOverride<TaskStream, TaskStreamState, TaskStreamState,
            TaskStreamState, String> {
  const TaskStreamFamily._()
      : super(
          retry: null,
          name: r'taskStreamProvider',
          dependencies: null,
          $allTransitiveDependencies: null,
          isAutoDispose: true,
        );

  /// Connects to `WS /tasks/:id/stream?since=<seq>`, replays missed events then live-tails,
  /// and reconnects (from the last seen seq) on drop — mirrors the daemon's replay
  /// contract so no output is lost across a disconnect (S1-06 ↔ S1-10).

  TaskStreamProvider call(
    String taskId,
  ) =>
      TaskStreamProvider._(argument: taskId, from: this);

  @override
  String toString() => r'taskStreamProvider';
}

/// Connects to `WS /tasks/:id/stream?since=<seq>`, replays missed events then live-tails,
/// and reconnects (from the last seen seq) on drop — mirrors the daemon's replay
/// contract so no output is lost across a disconnect (S1-06 ↔ S1-10).

abstract class _$TaskStream extends $Notifier<TaskStreamState> {
  late final _$args = ref.$arg as String;
  String get taskId => _$args;

  TaskStreamState build(
    String taskId,
  );
  @$mustCallSuper
  @override
  void runBuild() {
    final created = build(
      _$args,
    );
    final ref = this.ref as $Ref<TaskStreamState, TaskStreamState>;
    final element = ref.element as $ClassProviderElement<
        AnyNotifier<TaskStreamState, TaskStreamState>,
        TaskStreamState,
        Object?,
        Object?>;
    element.handleValue(ref, created);
  }
}
