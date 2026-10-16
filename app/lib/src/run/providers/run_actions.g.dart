// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'run_actions.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// Live-run actions (S5-05/06): device discovery, start, hot reload/restart, stop. Stateless —
/// each method hits one daemon endpoint.

@ProviderFor(RunActions)
const runActionsProvider = RunActionsProvider._();

/// Live-run actions (S5-05/06): device discovery, start, hot reload/restart, stop. Stateless —
/// each method hits one daemon endpoint.
final class RunActionsProvider extends $NotifierProvider<RunActions, void> {
  /// Live-run actions (S5-05/06): device discovery, start, hot reload/restart, stop. Stateless —
  /// each method hits one daemon endpoint.
  const RunActionsProvider._()
      : super(
          from: null,
          argument: null,
          retry: null,
          name: r'runActionsProvider',
          isAutoDispose: true,
          dependencies: null,
          $allTransitiveDependencies: null,
        );

  @override
  String debugGetCreateSourceHash() => _$runActionsHash();

  @$internal
  @override
  RunActions create() => RunActions();

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(void value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<void>(value),
    );
  }
}

String _$runActionsHash() => r'05131d38fe499d9ea5e3fb49a6b9cea4917b0eba';

/// Live-run actions (S5-05/06): device discovery, start, hot reload/restart, stop. Stateless —
/// each method hits one daemon endpoint.

abstract class _$RunActions extends $Notifier<void> {
  void build();
  @$mustCallSuper
  @override
  void runBuild() {
    build();
    final ref = this.ref as $Ref<void, void>;
    final element = ref.element as $ClassProviderElement<
        AnyNotifier<void, void>, void, Object?, Object?>;
    element.handleValue(ref, null);
  }
}
