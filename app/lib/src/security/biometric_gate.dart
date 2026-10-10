import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import 'local_authenticator.dart';

part 'biometric_gate.g.dart';

enum GateOutcome { authenticated, failed, unavailable }

/// Result of a biometric gate check (S3-07).
class GateResult {
  const GateResult(this.outcome, [this.message]);

  final GateOutcome outcome;
  final String? message;

  bool get ok => outcome == GateOutcome.authenticated;
}

/// Gates sensitive actions (push, build & distribute, "always allow") behind a biometric /
/// device-credential check (CLAUDE.md). Fails closed: if the device can't authenticate or
/// the prompt fails, the action is blocked.
class BiometricGate {
  BiometricGate(this._auth);

  final LocalAuthenticator _auth;

  Future<GateResult> require(String reason) async {
    bool supported;
    try {
      supported = await _auth.isSupported();
    } catch (_) {
      supported = false;
    }
    if (!supported) {
      return const GateResult(
        GateOutcome.unavailable,
        'No device lock set up — set a biometric or screen lock to allow this.',
      );
    }
    try {
      final ok = await _auth.authenticate(reason);
      return ok
          ? const GateResult(GateOutcome.authenticated)
          : const GateResult(GateOutcome.failed, 'Authentication failed');
    } catch (e) {
      return GateResult(GateOutcome.failed, 'Authentication error: $e');
    }
  }
}

/// App-wide gate using the real platform authenticator. Overridable in tests.
@Riverpod(keepAlive: true)
BiometricGate biometricGate(Ref ref) => BiometricGate(PlatformAuthenticator());

/// Run [reason] through the gate; on failure shows a snackbar and returns false. Call this
/// before a sensitive action and abort when it returns false.
Future<bool> ensureBiometric(
  WidgetRef ref,
  BuildContext context,
  String reason,
) async {
  final res = await ref.read(biometricGateProvider).require(reason);
  if (!res.ok && context.mounted) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(res.message ?? 'Blocked')));
  }
  return res.ok;
}
