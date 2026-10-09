import 'package:dio/dio.dart';

import '../error/app_exception.dart';

/// Wraps a network future and normalizes failures into [AppException]
/// (mirrors hedged's `.guard()` on futures).
extension FutureGuard<T> on Future<T> {
  Future<T> guard() async {
    try {
      return await this;
    } on DioException catch (e) {
      throw AppException.fromDio(e);
    } on AppException {
      rethrow;
    } catch (e) {
      throw AppException(ErrorType.other, e.toString());
    }
  }
}
