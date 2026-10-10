import 'dart:convert';

import 'package:dio/dio.dart';

import '../extension/log.dart';

/// Colorized request/response/error logging (mirrors hedged's LoggingInterceptor).
/// Add it only in debug builds, after the auth interceptor.
class LoggingInterceptor extends Interceptor {
  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    'x------------------------------'.logInfo();
    'Requesting : ${options.method} ${options.baseUrl}${options.path}'
        .logInfo();
    if (options.queryParameters.isNotEmpty) {
      'Query : ${options.queryParameters}'.logInfo();
    }
    if (options.data != null) 'Data : ${options.data}'.logInfo();
    '------------------------------x'.logInfo();
    handler.next(options);
  }

  @override
  void onResponse(
      Response<dynamic> response, ResponseInterceptorHandler handler) {
    'x------------------------------'.logSuccess();
    'Response : ${response.requestOptions.method} ${response.requestOptions.path}'
        .logSuccess();
    'Status : ${response.statusCode} - ${response.statusMessage}'.logSuccess();
    _tryEncode(response.data).logSuccess();
    '------------------------------x'.logSuccess();
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    'x------------------------------'.logError();
    'Error : ${err.requestOptions.method} ${err.requestOptions.uri.path}'
        .logError();
    'Error : ${err.message}'.logError();
    'Response : ${err.response?.statusCode} - ${err.response?.statusMessage}\n${err.response?.data}'
        .logError();
    '------------------------------x'.logError();
    handler.next(err);
  }

  String _tryEncode(dynamic data) {
    try {
      return 'Response : ${jsonEncode(data)}';
    } catch (_) {
      return 'Response : $data';
    }
  }
}
