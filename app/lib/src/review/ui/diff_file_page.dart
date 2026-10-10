import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/extension/context.dart';
import '../../routes/app_router.dart';
import '../diff_line.dart';
import '../providers/diff_providers.dart';

/// One file's unified diff (S2-07). Virtualized (ListView.builder) so large diffs
/// scroll smoothly.
@RoutePage()
class DiffFilePage extends ConsumerWidget {
  const DiffFilePage({required this.taskId, required this.path, super.key});

  final String taskId;
  final String path;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final diff = ref.watch(fileDiffProvider(taskId, path));
    return Scaffold(
      appBar: AppBar(
        title: Text(path.split('/').last),
        actions: [
          IconButton(
            tooltip: 'View full file',
            icon: const Icon(Icons.description_outlined),
            onPressed: () => context.router
                .push(CodeViewerRoute(taskId: taskId, path: path)),
          ),
        ],
      ),
      body: diff.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Padding(
          padding: const EdgeInsets.all(24),
          child: Text('$e', style: context.text.regular14),
        ),
        data: (d) {
          if (d.binary) {
            return Center(
              child: Text(
                'Binary file — not shown',
                style: context.text.regular14
                    .copyWith(color: context.colors.muted),
              ),
            );
          }
          final lines = (d.patch ?? '').split('\n');
          return Column(
            children: [
              if (d.truncated)
                Container(
                  width: double.infinity,
                  color: context.colors.red.withValues(alpha: 0.12),
                  padding: const EdgeInsets.all(8),
                  child: Text(
                    'Diff truncated (large file) — showing the first part only.',
                    style: context.text.regular12
                        .copyWith(color: context.colors.red),
                  ),
                ),
              Expanded(
                child: ListView.builder(
                  itemCount: lines.length,
                  itemBuilder: (_, i) => _DiffLine(line: lines[i]),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _DiffLine extends StatelessWidget {
  const _DiffLine({required this.line});

  final String line;

  @override
  Widget build(BuildContext context) {
    final kind = classifyDiffLine(line);
    final (bg, fg) = switch (kind) {
      DiffLineKind.added => (
          context.colors.green.withValues(alpha: 0.12),
          context.colors.onSurface
        ),
      DiffLineKind.removed => (
          context.colors.red.withValues(alpha: 0.12),
          context.colors.onSurface
        ),
      DiffLineKind.hunk => (
          context.colors.accent.withValues(alpha: 0.10),
          context.colors.accent
        ),
      DiffLineKind.meta => (null, context.colors.muted),
      DiffLineKind.context => (null, context.colors.onSurface),
    };
    return Container(
      width: double.infinity,
      color: bg,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 1),
      child: Text(
        line.isEmpty ? ' ' : line,
        style: TextStyle(
            fontFamily: 'monospace', fontSize: 12, color: fg, height: 1.35),
      ),
    );
  }
}
