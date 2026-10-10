import 'package:flutter/material.dart';

import '../../../core/extension/context.dart';
import '../highlighter.dart';

/// Reusable file renderer: syntax-highlighted, line-numbered, virtualized.
/// Shared by the task code viewer (S2-08) and the project browser.
class CodeView extends StatelessWidget {
  const CodeView({
    required this.path,
    required this.content,
    required this.binary,
    required this.truncated,
    super.key,
  });

  final String path;
  final String? content;
  final bool binary;
  final bool truncated;

  @override
  Widget build(BuildContext context) {
    if (binary) {
      return Center(
        child: Text(
          'Binary file — not shown',
          style: context.text.regular14.copyWith(color: context.colors.muted),
        ),
      );
    }
    final spansPerLine = highlightCode(content ?? '', languageForPath(path));
    final gutterWidth = '${spansPerLine.length}'.length * 9.0 + 12;
    return Column(
      children: [
        if (truncated)
          Container(
            width: double.infinity,
            color: context.colors.red.withValues(alpha: 0.12),
            padding: const EdgeInsets.all(8),
            child: Text(
              'File truncated (large) — showing the first part only.',
              style: context.text.regular12.copyWith(color: context.colors.red),
            ),
          ),
        Expanded(
          child: ListView.builder(
            itemCount: spansPerLine.length,
            itemBuilder: (_, i) => _CodeLine(
              lineNo: i + 1,
              spans: spansPerLine[i],
              gutterWidth: gutterWidth,
            ),
          ),
        ),
      ],
    );
  }
}

class _CodeLine extends StatelessWidget {
  const _CodeLine(
      {required this.lineNo, required this.spans, required this.gutterWidth});

  final int lineNo;
  final List<CodeSpan> spans;
  final double gutterWidth;

  Color _color(BuildContext context, CodeTokenType type) {
    final dark = context.isDark;
    switch (type) {
      case CodeTokenType.keyword:
        return dark ? const Color(0xFFC586C0) : const Color(0xFF7C3AED);
      case CodeTokenType.type:
        return dark ? const Color(0xFF4EC9B0) : const Color(0xFF0F766E);
      case CodeTokenType.string:
        return dark ? const Color(0xFFCE9178) : const Color(0xFFB45309);
      case CodeTokenType.number:
        return dark ? const Color(0xFFB5CEA8) : const Color(0xFF15803D);
      case CodeTokenType.comment:
        return context.colors.muted;
      case CodeTokenType.plain:
        return context.colors.onSurface;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 1),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: gutterWidth,
            child: Text(
              '$lineNo',
              textAlign: TextAlign.right,
              style: TextStyle(
                fontFamily: 'monospace',
                fontSize: 12,
                height: 1.4,
                color: context.colors.muted,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: RichText(
              text: TextSpan(
                children: [
                  for (final s in spans)
                    TextSpan(
                      text: s.text,
                      style: TextStyle(
                        fontFamily: 'monospace',
                        fontSize: 12,
                        height: 1.4,
                        color: _color(context, s.type),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
