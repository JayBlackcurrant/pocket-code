import 'package:dio/dio.dart';

enum ErrorType { response, connection, other }

/// Single normalized error type (mirrors hedged's AppException/ErrorType). Features
/// never surface raw DioException; `.guard()` converts everything into this.
class AppException implements Exception {
  AppException(this.type, this.message, {this.statusCode});

  final ErrorType type;
  final String message;
  final int? statusCode;

  factory AppException.fromDio(DioException e) {
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.connectionError:
        return AppException(
          ErrorType.connection,
          'Could not reach the daemon. Check Tailscale and that the Mac is awake.',
        );
      case DioExceptionType.badResponse:
        return AppException(
          ErrorType.response,
          _extractMessage(e.response?.data) ?? 'Request failed',
          statusCode: e.response?.statusCode,
        );
      default:
        return AppException(ErrorType.other, e.message ?? 'Unexpected error');
    }
  }

  static String? _extractMessage(dynamic data) {
    if (data is Map && data['error'] is String) return data['error'] as String;
    return null;
  }

  @override
  String toString() => message;
}
