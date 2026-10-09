/// The paired-daemon session: where to reach it and the device bearer token.
/// Hand-written immutable state class (hedged uses plain state classes, not freezed).
class PairingState {
  const PairingState({
    required this.baseUrl,
    required this.token,
    required this.deviceId,
  });

  final String baseUrl;
  final String token;
  final String deviceId;
}
