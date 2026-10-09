import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../interceptors/auth_interceptor.dart';

/// Builds a configured Dio for the daemon (mirrors hedged's DioInstance: base options
/// + interceptor chain). The bearer token is supplied per request via [getToken].
Dio buildDio({
  required String baseUrl,
  required String Function() getToken,
}) {
  final dio = Dio(
    BaseOptions(
      baseUrl: baseUrl,
      contentType: 'application/json',
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 30),
    ),
  );
  dio.interceptors.add(AuthInterceptor(getToken));
  if (kDebugMode) {
    dio.interceptors
        .add(LogInterceptor(requestBody: false, responseBody: false));
  }
  return dio;
}
