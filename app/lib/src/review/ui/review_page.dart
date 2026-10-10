import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/extension/context.dart';
import '../../routes/app_router.dart';
import '../models/diff_file.dart';
import '../providers/diff_providers.dart';

/// Changed-files list for a task (S2-07). Generated files are collapsed by default.
@RoutePage()
class ReviewPage extends ConsumerWidget {
  const ReviewPage({required this.taskId, super.key});

  final String taskId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final files = ref.watch(diffSummaryProvider(taskId));
    return Scaffold(
      appBar: AppBar(title: const Text('Review changes')),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(diffSummaryProvider(taskId)),
        child: files.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(
            children: [
              Padding(
                padding: const EdgeInsets.all(24),
                child: Text('$e', style: context.text.regular14),
              ),
            ],
          ),
          data: (list) {
            if (list.isEmpty) {
              return ListView(
                children: [
                  Padding(
                    padding: const EdgeInsets.all(24),
                    child:
                        Text('No changes yet.', style: context.text.regular14),
                  ),
                ],
              );
            }
            final normal = list.where((f) => !f.isGenerated).toList();
            final generated = list.where((f) => f.isGenerated).toList();
            return ListView(
              children: [
                ...normal.map((f) => _FileTile(taskId: taskId, file: f)),
                if (generated.isNotEmpty)
                  ExpansionTile(
                    title: Text(
                      'Generated files (${generated.length})',
                      style: context.text.medium14
                          .copyWith(color: context.colors.muted),
                    ),
                    children: generated
                        .map((f) => _FileTile(taskId: taskId, file: f))
                        .toList(),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _FileTile extends StatelessWidget {
  const _FileTile({required this.taskId, required this.file});

  final String taskId;
  final DiffFileSummary file;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      dense: true,
      leading: _StatusBadge(status: file.status),
      title: Text(file.path, style: context.text.regular14),
      subtitle: file.oldPath != null
          ? Text('from ${file.oldPath}',
              style:
                  context.text.regular12.copyWith(color: context.colors.muted))
          : null,
      trailing: file.binary
          ? Text('binary',
              style:
                  context.text.regular12.copyWith(color: context.colors.muted))
          : Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('+${file.additions}',
                    style: context.text.regular12
                        .copyWith(color: context.colors.green)),
                const SizedBox(width: 8),
                Text('-${file.deletions}',
                    style: context.text.regular12
                        .copyWith(color: context.colors.red)),
              ],
            ),
      onTap: () =>
          context.router.push(DiffFileRoute(taskId: taskId, path: file.path)),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final (letter, color) = switch (status) {
      'added' || 'untracked' => ('A', context.colors.green),
      'deleted' => ('D', context.colors.red),
      'renamed' => ('R', context.colors.accent),
      'copied' => ('C', context.colors.accent),
      _ => ('M', context.colors.muted),
    };
    return CircleAvatar(
      radius: 12,
      backgroundColor: color.withValues(alpha: 0.15),
      child: Text(letter, style: context.text.regular12.copyWith(color: color)),
    );
  }
}
