import 'package:dio/dio.dart';

/// Attaches the device bearer token per request. The token is read via a callback
/// (not captured), so pairing/unpairing never requires rebuilding the Dio client —
/// mirrors hedged's SessionCookieInterceptor.getCredential pattern.
class AuthInterceptor extends Interceptor {
  AuthInterceptor(this._getToken);

  final String Function() _getToken;

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final token = _getToken();
    if (token.isNotEmpty) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }
}
