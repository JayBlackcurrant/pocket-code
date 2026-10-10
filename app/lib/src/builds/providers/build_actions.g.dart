// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'build_actions.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// Build + distribution actions (S3-01/02/03/04): start, cancel, retry, upload, and the
/// release-notes suggestion. Stateless — each method hits one daemon endpoint.

@ProviderFor(BuildActions)
const buildActionsProvider = BuildActionsProvider._();

/// Build + distribution actions (S3-01/02/03/04): start, cancel, retry, upload, and the
/// release-notes suggestion. Stateless — each method hits one daemon endpoint.
final class BuildActionsProvider extends $NotifierProvider<BuildActions, void> {
  /// Build + distribution actions (S3-01/02/03/04): start, cancel, retry, upload, and the
  /// release-notes suggestion. Stateless — each method hits one daemon endpoint.
  const BuildActionsProvider._()
      : super(
          from: null,
          argument: null,
          retry: null,
          name: r'buildActionsProvider',
          isAutoDispose: true,
          dependencies: null,
          $allTransitiveDependencies: null,
        );

  @override
  String debugGetCreateSourceHash() => _$buildActionsHash();

  @$internal
  @override
  BuildActions create() => BuildActions();

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(void value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<void>(value),
    );
  }
}

String _$buildActionsHash() => r'711957ceb05960d65db8371323eb65aa7a6d6703';

/// Build + distribution actions (S3-01/02/03/04): start, cancel, retry, upload, and the
/// release-notes suggestion. Stateless — each method hits one daemon endpoint.

abstract class _$BuildActions extends $Notifier<void> {
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
