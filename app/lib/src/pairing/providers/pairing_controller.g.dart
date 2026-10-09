// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'pairing_controller.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// Drives the pairing flow: parse the scanned payload, POST /pair to the daemon,
/// and persist the issued token (mirrors hedged's feature controllers using
/// AsyncValue.guard).

@ProviderFor(PairingController)
const pairingControllerProvider = PairingControllerProvider._();

/// Drives the pairing flow: parse the scanned payload, POST /pair to the daemon,
/// and persist the issued token (mirrors hedged's feature controllers using
/// AsyncValue.guard).
final class PairingControllerProvider
    extends $AsyncNotifierProvider<PairingController, void> {
  /// Drives the pairing flow: parse the scanned payload, POST /pair to the daemon,
  /// and persist the issued token (mirrors hedged's feature controllers using
  /// AsyncValue.guard).
  const PairingControllerProvider._()
      : super(
          from: null,
          argument: null,
          retry: null,
          name: r'pairingControllerProvider',
          isAutoDispose: true,
          dependencies: null,
          $allTransitiveDependencies: null,
        );

  @override
  String debugGetCreateSourceHash() => _$pairingControllerHash();

  @$internal
  @override
  PairingController create() => PairingController();
}

String _$pairingControllerHash() => r'e4a32f46dda9726409e7e0c876080afc1e775c73';

/// Drives the pairing flow: parse the scanned payload, POST /pair to the daemon,
/// and persist the issued token (mirrors hedged's feature controllers using
/// AsyncValue.guard).

abstract class _$PairingController extends $AsyncNotifier<void> {
  FutureOr<void> build();
  @$mustCallSuper
  @override
  void runBuild() {
    build();
    final ref = this.ref as $Ref<AsyncValue<void>, void>;
    final element = ref.element as $ClassProviderElement<
        AnyNotifier<AsyncValue<void>, void>,
        AsyncValue<void>,
        Object?,
        Object?>;
    element.handleValue(ref, null);
  }
}
