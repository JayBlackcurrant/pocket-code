// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'git_actions.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// Git actions for a task (S2-09): commit, revert, push, discard.

@ProviderFor(GitActions)
const gitActionsProvider = GitActionsFamily._();

/// Git actions for a task (S2-09): commit, revert, push, discard.
final class GitActionsProvider extends $NotifierProvider<GitActions, void> {
  /// Git actions for a task (S2-09): commit, revert, push, discard.
  const GitActionsProvider._(
      {required GitActionsFamily super.from, required String super.argument})
      : super(
          retry: null,
          name: r'gitActionsProvider',
          isAutoDispose: true,
          dependencies: null,
          $allTransitiveDependencies: null,
        );

  @override
  String debugGetCreateSourceHash() => _$gitActionsHash();

  @override
  String toString() {
    return r'gitActionsProvider'
        ''
        '($argument)';
  }

  @$internal
  @override
  GitActions create() => GitActions();

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(void value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<void>(value),
    );
  }

  @override
  bool operator ==(Object other) {
    return other is GitActionsProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$gitActionsHash() => r'7c1e9471844e37589dd2d482428037f2afab11cf';

/// Git actions for a task (S2-09): commit, revert, push, discard.

final class GitActionsFamily extends $Family
    with $ClassFamilyOverride<GitActions, void, void, void, String> {
  const GitActionsFamily._()
      : super(
          retry: null,
          name: r'gitActionsProvider',
          dependencies: null,
          $allTransitiveDependencies: null,
          isAutoDispose: true,
        );

  /// Git actions for a task (S2-09): commit, revert, push, discard.

  GitActionsProvider call(
    String taskId,
  ) =>
      GitActionsProvider._(argument: taskId, from: this);

  @override
  String toString() => r'gitActionsProvider';
}

/// Git actions for a task (S2-09): commit, revert, push, discard.

abstract class _$GitActions extends $Notifier<void> {
  late final _$args = ref.$arg as String;
  String get taskId => _$args;

  void build(
    String taskId,
  );
  @$mustCallSuper
  @override
  void runBuild() {
    build(
      _$args,
    );
    final ref = this.ref as $Ref<void, void>;
    final element = ref.element as $ClassProviderElement<
        AnyNotifier<void, void>, void, Object?, Object?>;
    element.handleValue(ref, null);
  }
}
