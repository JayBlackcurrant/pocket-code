// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'pairing_provider.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// Session source of truth (mirrors hedged's tokenProvider): the device token + the
/// daemon base URL, persisted in secure storage. Null means "not paired".

@ProviderFor(Pairing)
const pairingProvider = PairingProvider._();

/// Session source of truth (mirrors hedged's tokenProvider): the device token + the
/// daemon base URL, persisted in secure storage. Null means "not paired".
final class PairingProvider
    extends $AsyncNotifierProvider<Pairing, PairingState?> {
  /// Session source of truth (mirrors hedged's tokenProvider): the device token + the
  /// daemon base URL, persisted in secure storage. Null means "not paired".
  const PairingProvider._()
      : super(
          from: null,
          argument: null,
          retry: null,
          name: r'pairingProvider',
          isAutoDispose: false,
          dependencies: null,
          $allTransitiveDependencies: null,
        );

  @override
  String debugGetCreateSourceHash() => _$pairingHash();

  @$internal
  @override
  Pairing create() => Pairing();
}

String _$pairingHash() => r'fa6d708ebea89a374975d6dde64bd858307fba3c';

/// Session source of truth (mirrors hedged's tokenProvider): the device token + the
/// daemon base URL, persisted in secure storage. Null means "not paired".

abstract class _$Pairing extends $AsyncNotifier<PairingState?> {
  FutureOr<PairingState?> build();
  @$mustCallSuper
  @override
  void runBuild() {
    final created = build();
    final ref = this.ref as $Ref<AsyncValue<PairingState?>, PairingState?>;
    final element = ref.element as $ClassProviderElement<
        AnyNotifier<AsyncValue<PairingState?>, PairingState?>,
        AsyncValue<PairingState?>,
        Object?,
        Object?>;
    element.handleValue(ref, created);
  }
}
