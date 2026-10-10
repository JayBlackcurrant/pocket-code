import 'package:local_auth/local_auth.dart';

/// Thin seam over the platform biometric API so the gate's policy is testable without
/// the `local_auth` plugin (which needs a real device/activity).
abstract interface class LocalAuthenticator {
  /// Whether the device can authenticate at all (enrolled biometric OR device PIN/pattern).
  Future<bool> isSupported();

  /// Prompt the user; returns true only on a successful authentication.
  Future<bool> authenticate(String reason);
}

/// Default implementation backed by the `local_auth` plugin.
class PlatformAuthenticator implements LocalAuthenticator {
  PlatformAuthenticator([LocalAuthentication? auth])
      : _auth = auth ?? LocalAuthentication();

  final LocalAuthentication _auth;

  @override
  Future<bool> isSupported() => _auth.isDeviceSupported();

  @override
  Future<bool> authenticate(String reason) => _auth.authenticate(
        localizedReason: reason,
        // Allow the device PIN/pattern as a fallback, and keep the prompt sticky across
        // brief backgrounding — but never bypass authentication entirely.
        options:
            const AuthenticationOptions(biometricOnly: false, stickyAuth: true),
      );
}
