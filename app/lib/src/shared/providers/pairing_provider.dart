import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../core/instances/secure_storage.dart';
import '../models/pairing_state.dart';

part 'pairing_provider.g.dart';

/// Session source of truth (mirrors hedged's tokenProvider): the device token + the
/// daemon base URL, persisted in secure storage. Null means "not paired".
@Riverpod(keepAlive: true)
class Pairing extends _$Pairing {
  static const _kToken = 'pc_token';
  static const _kBaseUrl = 'pc_base_url';
  static const _kDeviceId = 'pc_device_id';

  @override
  Future<PairingState?> build() async {
    final storage = ref.read(secureStorageProvider);
    final token = await storage.read(key: _kToken);
    final baseUrl = await storage.read(key: _kBaseUrl);
    final deviceId = await storage.read(key: _kDeviceId);
    if (token == null || baseUrl == null) return null;
    return PairingState(
        baseUrl: baseUrl, token: token, deviceId: deviceId ?? '');
  }

  Future<void> save(PairingState pairing) async {
    final storage = ref.read(secureStorageProvider);
    await storage.write(key: _kToken, value: pairing.token);
    await storage.write(key: _kBaseUrl, value: pairing.baseUrl);
    await storage.write(key: _kDeviceId, value: pairing.deviceId);
    state = AsyncData(pairing);
  }

  Future<void> clear() async {
    final storage = ref.read(secureStorageProvider);
    await Future.wait([
      storage.delete(key: _kToken),
      storage.delete(key: _kBaseUrl),
      storage.delete(key: _kDeviceId),
    ]);
    state = const AsyncData(null);
  }
}
