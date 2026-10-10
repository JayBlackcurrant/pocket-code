import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/extension/context.dart';
import '../highlighter.dart';
import '../providers/diff_providers.dart';

/// Full-file code viewer with syntax highlighting (S2-08). Lines are highlighted
/// up front then rendered with ListView.builder, so large files stay smooth.
@RoutePage()
class CodeViewerPage extends ConsumerWidget {
  const CodeViewerPage({required this.taskId, required this.path, super.key});

  final String taskId;
  final String path;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final file = ref.watch(fileContentProvider(taskId, path));
    return Scaffold(
      appBar: AppBar(title: Text(path.split('/').last)),
      body: file.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Padding(
          padding: const EdgeInsets.all(24),
          child: Text('$e', style: context.text.regular14),
        ),
        data: (f) {
          if (f.binary) {
            return Center(
              child: Text(
                'Binary file — not shown',
                style: context.text.regular14
                    .copyWith(color: context.colors.muted),
              ),
            );
          }
          final spansPerLine =
              highlightCode(f.content ?? '', languageForPath(path));
          final gutterWidth = '${spansPerLine.length}'.length * 9.0 + 12;
          return Column(
            children: [
              if (f.truncated)
                Container(
                  width: double.infinity,
                  color: context.colors.red.withValues(alpha: 0.12),
                  padding: const EdgeInsets.all(8),
                  child: Text(
                    'File truncated (large) — showing the first part only.',
                    style: context.text.regular12
                        .copyWith(color: context.colors.red),
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
        },
      ),
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
