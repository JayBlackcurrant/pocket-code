import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../src/shared/providers/pairing_provider.dart';
import 'dio_instance.dart';

part 'api_client.g.dart';

/// The single Dio client for the paired daemon (mirrors hedged's keepAlive apiProvider).
/// Rebuilds only when the base URL changes (pair/unpair); the token is read per request.
@Riverpod(keepAlive: true)
Dio api(Ref ref) {
  final baseUrl =
      ref.watch(pairingProvider.select((p) => p.value?.baseUrl)) ?? '';
  return buildDio(
    baseUrl: baseUrl,
    getToken: () => ref.read(pairingProvider).value?.token ?? '',
  );
}
