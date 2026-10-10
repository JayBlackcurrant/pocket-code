/// Minimal, dependency-free syntax highlighter for the code viewer (S2-08).
/// Produces spans per line so the viewer can virtualize large files. Good enough to
/// make Dart and YAML readable — not a full parser.
enum CodeTokenType { keyword, type, string, comment, number, plain }

class CodeSpan {
  const CodeSpan(this.text, this.type);
  final String text;
  final CodeTokenType type;
}

enum CodeLanguage { dart, yaml, plain }

CodeLanguage languageForPath(String path) {
  if (path.endsWith('.dart')) return CodeLanguage.dart;
  if (path.endsWith('.yaml') || path.endsWith('.yml')) return CodeLanguage.yaml;
  return CodeLanguage.plain;
}

/// Highlight [content] as [lang]; returns spans per source line.
List<List<CodeSpan>> highlightCode(String content, CodeLanguage lang) {
  final lines = content.split('\n');
  switch (lang) {
    case CodeLanguage.dart:
      return _highlightDart(lines);
    case CodeLanguage.yaml:
      return lines.map(_highlightYamlLine).toList();
    case CodeLanguage.plain:
      return lines.map((l) => [CodeSpan(l, CodeTokenType.plain)]).toList();
  }
}

const _dartKeywords = <String>{
  'abstract',
  'as',
  'assert',
  'async',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'covariant',
  'default',
  'deferred',
  'do',
  'dynamic',
  'else',
  'enum',
  'export',
  'extends',
  'extension',
  'external',
  'factory',
  'false',
  'final',
  'finally',
  'for',
  'Function',
  'get',
  'hide',
  'if',
  'implements',
  'import',
  'in',
  'is',
  'late',
  'library',
  'mixin',
  'new',
  'null',
  'on',
  'operator',
  'part',
  'required',
  'rethrow',
  'return',
  'sealed',
  'set',
  'show',
  'static',
  'super',
  'switch',
  'sync',
  'this',
  'throw',
  'true',
  'try',
  'typedef',
  'var',
  'void',
  'while',
  'with',
  'yield',
};

bool _isIdentStart(String c) => RegExp(r'[A-Za-z_$]').hasMatch(c);
bool _isIdentPart(String c) => RegExp(r'[A-Za-z0-9_$]').hasMatch(c);
bool _isDigit(String c) => c.compareTo('0') >= 0 && c.compareTo('9') <= 0;

List<List<CodeSpan>> _highlightDart(List<String> lines) {
  final out = <List<CodeSpan>>[];
  var inBlock = false;
  for (final line in lines) {
    final spans = <CodeSpan>[];
    final plain = StringBuffer();
    void flush() {
      if (plain.isNotEmpty) {
        spans.add(CodeSpan(plain.toString(), CodeTokenType.plain));
        plain.clear();
      }
    }

    var i = 0;
    while (i < line.length) {
      if (inBlock) {
        final end = line.indexOf('*/', i);
        if (end == -1) {
          spans.add(CodeSpan(line.substring(i), CodeTokenType.comment));
          i = line.length;
        } else {
          spans
              .add(CodeSpan(line.substring(i, end + 2), CodeTokenType.comment));
          i = end + 2;
          inBlock = false;
        }
        continue;
      }
      final rest2 = i + 1 < line.length ? line.substring(i, i + 2) : '';
      if (rest2 == '//') {
        flush();
        spans.add(CodeSpan(line.substring(i), CodeTokenType.comment));
        i = line.length;
        continue;
      }
      if (rest2 == '/*') {
        flush();
        final end = line.indexOf('*/', i + 2);
        if (end == -1) {
          spans.add(CodeSpan(line.substring(i), CodeTokenType.comment));
          i = line.length;
          inBlock = true;
        } else {
          spans
              .add(CodeSpan(line.substring(i, end + 2), CodeTokenType.comment));
          i = end + 2;
        }
        continue;
      }
      final ch = line[i];
      if (ch == "'" || ch == '"') {
        flush();
        final endExclusive = _scanString(line, i, ch);
        spans.add(
            CodeSpan(line.substring(i, endExclusive), CodeTokenType.string));
        i = endExclusive;
        continue;
      }
      if (_isIdentStart(ch)) {
        var j = i + 1;
        while (j < line.length && _isIdentPart(line[j])) {
          j++;
        }
        final word = line.substring(i, j);
        flush();
        if (_dartKeywords.contains(word)) {
          spans.add(CodeSpan(word, CodeTokenType.keyword));
        } else if (word[0] == word[0].toUpperCase() &&
            RegExp(r'[A-Za-z]').hasMatch(word[0])) {
          spans.add(CodeSpan(word, CodeTokenType.type));
        } else {
          spans.add(CodeSpan(word, CodeTokenType.plain));
        }
        i = j;
        continue;
      }
      if (_isDigit(ch)) {
        var j = i + 1;
        while (
            j < line.length && RegExp(r'[0-9a-fA-FxX._]').hasMatch(line[j])) {
          j++;
        }
        flush();
        spans.add(CodeSpan(line.substring(i, j), CodeTokenType.number));
        i = j;
        continue;
      }
      plain.write(ch);
      i++;
    }
    flush();
    if (spans.isEmpty) spans.add(const CodeSpan('', CodeTokenType.plain));
    out.add(spans);
  }
  return out;
}

/// Advance past a quoted string starting at [start] (quote [q]); returns the index
/// after the closing quote, or end-of-line if unterminated.
int _scanString(String line, int start, String q) {
  var i = start + 1;
  while (i < line.length) {
    if (line[i] == r'\') {
      i += 2;
      continue;
    }
    if (line[i] == q) return i + 1;
    i++;
  }
  return line.length;
}

List<CodeSpan> _highlightYamlLine(String line) {
  if (line.trimLeft().startsWith('#')) {
    return [CodeSpan(line, CodeTokenType.comment)];
  }
  final m = RegExp(r'^(\s*(?:- )?)([\w.$-]+)(:)(.*)$').firstMatch(line);
  if (m == null) {
    return [CodeSpan(line, CodeTokenType.plain)];
  }
  final spans = <CodeSpan>[
    CodeSpan(m.group(1)!, CodeTokenType.plain),
    CodeSpan(m.group(2)!, CodeTokenType.keyword),
    CodeSpan(m.group(3)!, CodeTokenType.plain),
  ];
  final value = m.group(4)!;
  final hash = value.indexOf('#');
  final code = hash == -1 ? value : value.substring(0, hash);
  final trimmed = code.trim();
  if (trimmed.isNotEmpty) {
    final isQuoted = (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"));
    final isNum = RegExp(r'^-?\d+(\.\d+)?$').hasMatch(trimmed);
    final isBool = trimmed == 'true' || trimmed == 'false' || trimmed == 'null';
    final type = (isQuoted)
        ? CodeTokenType.string
        : (isNum
            ? CodeTokenType.number
            : (isBool ? CodeTokenType.keyword : CodeTokenType.plain));
    spans.add(CodeSpan(code, type));
  } else {
    spans.add(CodeSpan(code, CodeTokenType.plain));
  }
  if (hash != -1) {
    spans.add(CodeSpan(value.substring(hash), CodeTokenType.comment));
  }
  return spans;
}
