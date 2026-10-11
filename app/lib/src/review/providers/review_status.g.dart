// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'review_status.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning

@ProviderFor(taskReviewStatus)
const taskReviewStatusProvider = TaskReviewStatusFamily._();

final class TaskReviewStatusProvider extends $FunctionalProvider<
        AsyncValue<ReviewStatus>, ReviewStatus, FutureOr<ReviewStatus>>
    with $FutureModifier<ReviewStatus>, $FutureProvider<ReviewStatus> {
  const TaskReviewStatusProvider._(
      {required TaskReviewStatusFamily super.from,
      required String super.argument})
      : super(
          retry: null,
          name: r'taskReviewStatusProvider',
          isAutoDispose: true,
          dependencies: null,
          $allTransitiveDependencies: null,
        );

  @override
  String debugGetCreateSourceHash() => _$taskReviewStatusHash();

  @override
  String toString() {
    return r'taskReviewStatusProvider'
        ''
        '($argument)';
  }

  @$internal
  @override
  $FutureProviderElement<ReviewStatus> $createElement(
          $ProviderPointer pointer) =>
      $FutureProviderElement(pointer);

  @override
  FutureOr<ReviewStatus> create(Ref ref) {
    final argument = this.argument as String;
    return taskReviewStatus(
      ref,
      argument,
    );
  }

  @override
  bool operator ==(Object other) {
    return other is TaskReviewStatusProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$taskReviewStatusHash() => r'93de7cb7d77bb8c8f66994bdc54e4234771015ee';

final class TaskReviewStatusFamily extends $Family
    with $FunctionalFamilyOverride<FutureOr<ReviewStatus>, String> {
  const TaskReviewStatusFamily._()
      : super(
          retry: null,
          name: r'taskReviewStatusProvider',
          dependencies: null,
          $allTransitiveDependencies: null,
          isAutoDispose: true,
        );

  TaskReviewStatusProvider call(
    String taskId,
  ) =>
      TaskReviewStatusProvider._(argument: taskId, from: this);

  @override
  String toString() => r'taskReviewStatusProvider';
}
