/// An active `@mention` the cursor is currently inside.
class ActiveMention {
  const ActiveMention({required this.start, required this.query});

  /// Index of the `@`.
  final int start;

  /// Text typed after the `@`, up to the cursor.
  final String query;
}

/// Find the `@mention` the cursor is in, if any. A mention starts at an `@` that is
/// at the start of the text or preceded by whitespace, with no whitespace between it
/// and the cursor. Pure + testable.
ActiveMention? parseActiveMention(String text, int cursor) {
  if (cursor < 0 || cursor > text.length) return null;
  for (var i = cursor - 1; i >= 0; i--) {
    final c = text[i];
    if (c == '@') {
      final before = i == 0 ? ' ' : text[i - 1];
      if (before == ' ' || before == '\n' || before == '\t') {
        return ActiveMention(start: i, query: text.substring(i + 1, cursor));
      }
      return null;
    }
    if (c == ' ' || c == '\n' || c == '\t') {
      return null; // whitespace ends a mention
    }
  }
  return null;
}
