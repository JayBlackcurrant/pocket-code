// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'task_provider.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// Fetches a task's current state (GET /tasks/:id). The live event stream is S1-10.

@ProviderFor(taskDetail)
const taskDetailProvider = TaskDetailFamily._();

/// Fetches a task's current state (GET /tasks/:id). The live event stream is S1-10.

final class TaskDetailProvider extends $FunctionalProvider<
        AsyncValue<TaskDetail>, TaskDetail, FutureOr<TaskDetail>>
    with $FutureModifier<TaskDetail>, $FutureProvider<TaskDetail> {
  /// Fetches a task's current state (GET /tasks/:id). The live event stream is S1-10.
  const TaskDetailProvider._(
      {required TaskDetailFamily super.from, required String super.argument})
      : super(
          retry: null,
          name: r'taskDetailProvider',
          isAutoDispose: true,
          dependencies: null,
          $allTransitiveDependencies: null,
        );

  @override
  String debugGetCreateSourceHash() => _$taskDetailHash();

  @override
  String toString() {
    return r'taskDetailProvider'
        ''
        '($argument)';
  }

  @$internal
  @override
  $FutureProviderElement<TaskDetail> $createElement($ProviderPointer pointer) =>
      $FutureProviderElement(pointer);

  @override
  FutureOr<TaskDetail> create(Ref ref) {
    final argument = this.argument as String;
    return taskDetail(
      ref,
      argument,
    );
  }

  @override
  bool operator ==(Object other) {
    return other is TaskDetailProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$taskDetailHash() => r'4ae12115b3bbd748124cc0b38ff19c55681862b3';

/// Fetches a task's current state (GET /tasks/:id). The live event stream is S1-10.

final class TaskDetailFamily extends $Family
    with $FunctionalFamilyOverride<FutureOr<TaskDetail>, String> {
  const TaskDetailFamily._()
      : super(
          retry: null,
          name: r'taskDetailProvider',
          dependencies: null,
          $allTransitiveDependencies: null,
          isAutoDispose: true,
        );

  /// Fetches a task's current state (GET /tasks/:id). The live event stream is S1-10.

  TaskDetailProvider call(
    String taskId,
  ) =>
      TaskDetailProvider._(argument: taskId, from: this);

  @override
  String toString() => r'taskDetailProvider';
}
