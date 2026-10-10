import 'dart:developer';

/// Colored console logging (mirrors hedged's LogExtension). Used by the logging
/// interceptor and anywhere a quick, colorized dev log helps.
extension LogExtension on Object? {
  void logInfo() => log('\x1B[35m$this\x1B[0m');

  void logSuccess() => log('\x1B[32m$this\x1B[0m');

  void logWarning() => log('\x1B[33m$this\x1B[0m');

  void logError() => log('\x1B[31m$this\x1B[0m', name: 'Error');
}
