// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'biometric_gate.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// App-wide gate using the real platform authenticator. Overridable in tests.

@ProviderFor(biometricGate)
const biometricGateProvider = BiometricGateProvider._();

/// App-wide gate using the real platform authenticator. Overridable in tests.

final class BiometricGateProvider
    extends $FunctionalProvider<BiometricGate, BiometricGate, BiometricGate>
    with $Provider<BiometricGate> {
  /// App-wide gate using the real platform authenticator. Overridable in tests.
  const BiometricGateProvider._()
      : super(
          from: null,
          argument: null,
          retry: null,
          name: r'biometricGateProvider',
          isAutoDispose: false,
          dependencies: null,
          $allTransitiveDependencies: null,
        );

  @override
  String debugGetCreateSourceHash() => _$biometricGateHash();

  @$internal
  @override
  $ProviderElement<BiometricGate> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  BiometricGate create(Ref ref) {
    return biometricGate(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(BiometricGate value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<BiometricGate>(value),
    );
  }
}

String _$biometricGateHash() => r'1e7a595d02395bc226b583c12d096bee82710883';
