import 'package:flutter_test/flutter_test.dart';
import 'package:pocketcode/src/project/mention.dart';

void main() {
  test('detects a mention at the cursor', () {
    const text = 'fix @mai';
    final m = parseActiveMention(text, text.length);
    expect(m, isNotNull);
    expect(m!.start, 4);
    expect(m.query, 'mai');
  });

  test('mention at start of text', () {
    final m = parseActiveMention('@lib', 4);
    expect(m!.start, 0);
    expect(m.query, 'lib');
  });

  test('no mention when @ is mid-word', () {
    expect(parseActiveMention('email@x', 7), isNull);
  });

  test('whitespace after @token ends the mention', () {
    final text = 'use @file now';
    // cursor after "now" — not inside the mention anymore
    expect(parseActiveMention(text, text.length), isNull);
  });

  test('empty query right after @', () {
    final m = parseActiveMention('do @', 4);
    expect(m!.query, '');
  });
}
