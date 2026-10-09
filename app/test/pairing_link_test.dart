import 'package:flutter_test/flutter_test.dart';
import 'package:pocketcode/core/error/app_exception.dart';
import 'package:pocketcode/src/pairing/pairing_link.dart';

void main() {
  test('parses a valid pairing link', () {
    final link = parsePairingPayload(
      'pocketcode://pair?url=http%3A%2F%2F127.0.0.1%3A8787&code=abc123',
    );
    expect(link.url, 'http://127.0.0.1:8787');
    expect(link.code, 'abc123');
  });

  test('rejects a non-pocketcode link', () {
    expect(
      () => parsePairingPayload('https://example.com'),
      throwsA(isA<AppException>()),
    );
  });

  test('rejects a link missing the code', () {
    expect(
      () => parsePairingPayload('pocketcode://pair?url=http://x'),
      throwsA(isA<AppException>()),
    );
  });
}
