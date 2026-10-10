import 'package:flutter_test/flutter_test.dart';
import 'package:pocketcode/src/review/highlighter.dart';

CodeTokenType typeOf(List<CodeSpan> spans, String text) =>
    spans.firstWhere((s) => s.text == text).type;

void main() {
  test('languageForPath', () {
    expect(languageForPath('lib/main.dart'), CodeLanguage.dart);
    expect(languageForPath('pubspec.yaml'), CodeLanguage.yaml);
    expect(languageForPath('a.yml'), CodeLanguage.yaml);
    expect(languageForPath('README.md'), CodeLanguage.plain);
  });

  test('dart: keywords, types, strings, comments', () {
    final lines = highlightCode("class A {} // hi\nfinal s = 'x';", CodeLanguage.dart);
    expect(typeOf(lines[0], 'class'), CodeTokenType.keyword);
    expect(typeOf(lines[0], 'A'), CodeTokenType.type);
    expect(lines[0].any((s) => s.type == CodeTokenType.comment && s.text.contains('hi')), true);
    expect(typeOf(lines[1], 'final'), CodeTokenType.keyword);
    expect(lines[1].any((s) => s.type == CodeTokenType.string && s.text == "'x'"), true);
  });

  test('dart: block comment carries across lines', () {
    final lines = highlightCode('/* a\nb */ final', CodeLanguage.dart);
    expect(lines[0].single.type, CodeTokenType.comment);
    expect(lines[1].any((s) => s.type == CodeTokenType.comment && s.text.contains('b */')), true);
    expect(lines[1].any((s) => s.type == CodeTokenType.keyword && s.text == 'final'), true);
  });

  test('yaml: key, comment, number', () {
    final lines = highlightCode('name: pocketcode # app\nport: 8787', CodeLanguage.yaml);
    expect(typeOf(lines[0], 'name'), CodeTokenType.keyword);
    expect(lines[0].any((s) => s.type == CodeTokenType.comment && s.text.contains('# app')), true);
    expect(lines[1].any((s) => s.type == CodeTokenType.number && s.text.trim() == '8787'), true);
  });
}
