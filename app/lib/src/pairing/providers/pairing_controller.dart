import 'dart:io' show Platform;

import 'package:dio/dio.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../core/error/app_exception.dart';
import '../../shared/models/pairing_state.dart';
import '../../shared/providers/pairing_provider.dart';
import '../pairing_link.dart';

part 'pairing_controller.g.dart';

/// Drives the pairing flow: parse the scanned payload, POST /pair to the daemon,
/// and persist the issued token (mirrors hedged's feature controllers using
/// AsyncValue.guard).
@riverpod
class PairingController extends _$PairingController {
  @override
  FutureOr<void> build() {}

  /// Returns true on success. Errors are surfaced via [state].
  Future<bool> pairFromPayload(String payload) async {
    state = const AsyncLoading();
    final result = await AsyncValue.guard(() async {
      final link = parsePairingPayload(payload);
      final dio = Dio(
        BaseOptions(
          baseUrl: link.url,
          contentType: 'application/json',
          connectTimeout: const Duration(seconds: 10),
        ),
      );
      final Response<dynamic> res;
      try {
        res = await dio.post<dynamic>(
          '/pair',
          data: {'code': link.code, 'deviceName': _deviceName()},
        );
      } on DioException catch (e) {
        throw AppException.fromDio(e);
      }
      final data = res.data as Map;
      await ref.read(pairingProvider.notifier).save(
            PairingState(
              baseUrl: link.url,
              token: data['token'] as String,
              deviceId: (data['deviceId'] ?? '') as String,
            ),
          );
    });
    state = result;
    return !result.hasError;
  }

  String _deviceName() => '${Platform.operatingSystem} · PocketCode';
}
