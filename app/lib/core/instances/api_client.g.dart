// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'api_client.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The single Dio client for the paired daemon (mirrors hedged's keepAlive apiProvider).
/// Rebuilds only when the base URL changes (pair/unpair); the token is read per request.

@ProviderFor(api)
const apiProvider = ApiProvider._();

/// The single Dio client for the paired daemon (mirrors hedged's keepAlive apiProvider).
/// Rebuilds only when the base URL changes (pair/unpair); the token is read per request.

final class ApiProvider extends $FunctionalProvider<Dio, Dio, Dio>
    with $Provider<Dio> {
  /// The single Dio client for the paired daemon (mirrors hedged's keepAlive apiProvider).
  /// Rebuilds only when the base URL changes (pair/unpair); the token is read per request.
  const ApiProvider._()
      : super(
          from: null,
          argument: null,
          retry: null,
          name: r'apiProvider',
          isAutoDispose: false,
          dependencies: null,
          $allTransitiveDependencies: null,
        );

  @override
  String debugGetCreateSourceHash() => _$apiHash();

  @$internal
  @override
  $ProviderElement<Dio> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  Dio create(Ref ref) {
    return api(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(Dio value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<Dio>(value),
    );
  }
}

String _$apiHash() => r'a2fa1b58ecfab4f0447875f4f17640965d1b69d1';
