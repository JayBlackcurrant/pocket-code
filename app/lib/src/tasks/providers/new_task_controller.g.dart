// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'new_task_controller.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// Creates and starts a task on a project (POST /projects/:id/tasks).

@ProviderFor(NewTaskController)
const newTaskControllerProvider = NewTaskControllerProvider._();

/// Creates and starts a task on a project (POST /projects/:id/tasks).
final class NewTaskControllerProvider
    extends $AsyncNotifierProvider<NewTaskController, StartedTask?> {
  /// Creates and starts a task on a project (POST /projects/:id/tasks).
  const NewTaskControllerProvider._()
      : super(
          from: null,
          argument: null,
          retry: null,
          name: r'newTaskControllerProvider',
          isAutoDispose: true,
          dependencies: null,
          $allTransitiveDependencies: null,
        );

  @override
  String debugGetCreateSourceHash() => _$newTaskControllerHash();

  @$internal
  @override
  NewTaskController create() => NewTaskController();
}

String _$newTaskControllerHash() => r'440ce1db2d1f7c4a4a67b441389a80f511f8ecf1';

/// Creates and starts a task on a project (POST /projects/:id/tasks).

abstract class _$NewTaskController extends $AsyncNotifier<StartedTask?> {
  FutureOr<StartedTask?> build();
  @$mustCallSuper
  @override
  void runBuild() {
    final created = build();
    final ref = this.ref as $Ref<AsyncValue<StartedTask?>, StartedTask?>;
    final element = ref.element as $ClassProviderElement<
        AnyNotifier<AsyncValue<StartedTask?>, StartedTask?>,
        AsyncValue<StartedTask?>,
        Object?,
        Object?>;
    element.handleValue(ref, created);
  }
}
