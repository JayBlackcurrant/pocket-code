// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'app_router.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// Router exposed as a keepAlive provider so guards can inject `Ref`
/// (mirrors hedged's appRouter provider + @AutoRouterConfig).

@ProviderFor(appRouter)
const appRouterProvider = AppRouterProvider._();

/// Router exposed as a keepAlive provider so guards can inject `Ref`
/// (mirrors hedged's appRouter provider + @AutoRouterConfig).

final class AppRouterProvider
    extends $FunctionalProvider<Raw<AppRouter>, Raw<AppRouter>, Raw<AppRouter>>
    with $Provider<Raw<AppRouter>> {
  /// Router exposed as a keepAlive provider so guards can inject `Ref`
  /// (mirrors hedged's appRouter provider + @AutoRouterConfig).
  const AppRouterProvider._()
      : super(
          from: null,
          argument: null,
          retry: null,
          name: r'appRouterProvider',
          isAutoDispose: false,
          dependencies: null,
          $allTransitiveDependencies: null,
        );

  @override
  String debugGetCreateSourceHash() => _$appRouterHash();

  @$internal
  @override
  $ProviderElement<Raw<AppRouter>> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  Raw<AppRouter> create(Ref ref) {
    return appRouter(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(Raw<AppRouter> value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<Raw<AppRouter>>(value),
    );
  }
}

String _$appRouterHash() => r'babffb8e22cefce44520192b1132c6d68d9f20a5';
