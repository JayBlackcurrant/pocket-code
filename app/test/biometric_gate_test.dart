import 'package:flutter_test/flutter_test.dart';
import 'package:pocketcode/src/security/biometric_gate.dart';
import 'package:pocketcode/src/security/local_authenticator.dart';

class _FakeAuth implements LocalAuthenticator {
  _FakeAuth({this.supported = true, this.result = true, this.throwOnSupport = false, this.throwOnAuth = false});

  final bool supported;
  final bool result;
  final bool throwOnSupport;
  final bool throwOnAuth;

  @override
  Future<bool> isSupported() async {
    if (throwOnSupport) throw Exception('boom');
    return supported;
  }

  @override
  Future<bool> authenticate(String reason) async {
    if (throwOnAuth) throw Exception('prompt failed');
    return result;
  }
}

void main() {
  group('BiometricGate', () {
    test('authenticated when supported and the prompt succeeds', () async {
      final res = await BiometricGate(_FakeAuth()).require('do it');
      expect(res.ok, isTrue);
      expect(res.outcome, GateOutcome.authenticated);
    });

    test('failed when the prompt is declined', () async {
      final res = await BiometricGate(_FakeAuth(result: false)).require('do it');
      expect(res.ok, isFalse);
      expect(res.outcome, GateOutcome.failed);
    });

    test('unavailable (blocked) when the device cannot authenticate', () async {
      final res = await BiometricGate(_FakeAuth(supported: false)).require('do it');
      expect(res.ok, isFalse);
      expect(res.outcome, GateOutcome.unavailable);
    });

    test('fails closed when isSupported throws', () async {
      final res = await BiometricGate(_FakeAuth(throwOnSupport: true)).require('do it');
      expect(res.ok, isFalse);
      expect(res.outcome, GateOutcome.unavailable);
    });

    test('fails closed when the prompt throws', () async {
      final res = await BiometricGate(_FakeAuth(throwOnAuth: true)).require('do it');
      expect(res.ok, isFalse);
      expect(res.outcome, GateOutcome.failed);
    });
  });
}
