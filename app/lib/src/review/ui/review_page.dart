import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/extension/context.dart';
import '../../routes/app_router.dart';
import '../../security/biometric_gate.dart';
import '../models/diff_file.dart';
import '../providers/diff_providers.dart';
import '../providers/git_actions.dart';

/// Changed-files list for a task (S2-07) with git actions (S2-09).
@RoutePage()
class ReviewPage extends ConsumerWidget {
  const ReviewPage({required this.taskId, super.key});

  final String taskId;

  Future<void> _commit(BuildContext context, WidgetRef ref) async {
    final actions = ref.read(gitActionsProvider(taskId).notifier);
    final suggested = await actions.suggestMessage().catchError((_) => '');
    if (!context.mounted) return;
    final controller = TextEditingController(text: suggested);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Commit changes'),
        content: TextField(
          controller: controller,
          autofocus: true,
          minLines: 1,
          maxLines: 3,
          decoration: const InputDecoration(labelText: 'Commit message'),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Commit')),
        ],
      ),
    );
    final message = controller.text.trim();
    controller.dispose();
    if (!(ok ?? false)) return;
    await _run(context, ref, () async {
      final sha = await actions.commit(message);
      return 'Committed ${sha.substring(0, sha.length < 7 ? sha.length : 7)}';
    });
  }

  Future<void> _push(BuildContext context, WidgetRef ref) async {
    if (!await _confirm(context, 'Push branch?',
        'Push this task\'s claude/* branch to the remote.')) {
      return;
    }
    if (!context.mounted) return;
    // Sensitive action — gate behind biometric (S3-07).
    if (!await ensureBiometric(ref, context, 'Confirm to push the branch')) {
      return;
    }
    if (!context.mounted) return;
    await _run(context, ref, () async {
      final branch = await ref.read(gitActionsProvider(taskId).notifier).push();
      return 'Pushed $branch';
    });
  }

  Future<void> _discard(BuildContext context, WidgetRef ref) async {
    if (!await _confirm(context, 'Discard task?',
        'Removes the worktree and deletes the branch. This cannot be undone.')) {
      return;
    }
    try {
      await ref.read(gitActionsProvider(taskId).notifier).discard();
      if (context.mounted) await context.router.replaceAll([const HomeRoute()]);
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$e')));
      }
    }
  }

  Future<bool> _confirm(BuildContext context, String title, String body) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Confirm')),
        ],
      ),
    );
    return ok ?? false;
  }

  Future<void> _run(BuildContext context, WidgetRef ref,
      Future<String> Function() action) async {
    try {
      final msg = await action();
      ref.invalidate(diffSummaryProvider(taskId));
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(msg)));
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$e')));
      }
    }
  }

  Future<void> _revertFile(
      BuildContext context, WidgetRef ref, String path) async {
    if (!await _confirm(context, 'Revert file?', 'Discard changes to $path.')) {
      return;
    }
    await _run(context, ref, () async {
      await ref.read(gitActionsProvider(taskId).notifier).revert(path);
      return 'Reverted $path';
    });
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final files = ref.watch(diffSummaryProvider(taskId));
    return Scaffold(
      appBar: AppBar(
        title: const Text('Review changes'),
        actions: [
          PopupMenuButton<String>(
            onSelected: (v) {
              switch (v) {
                case 'commit':
                  _commit(context, ref);
                case 'push':
                  _push(context, ref);
                case 'discard':
                  _discard(context, ref);
              }
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'commit', child: Text('Commit…')),
              PopupMenuItem(value: 'push', child: Text('Push branch')),
              PopupMenuItem(value: 'discard', child: Text('Discard task')),
            ],
          ),
        ],
      ),
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
                ...normal.map(
                  (f) => _FileTile(
                    taskId: taskId,
                    file: f,
                    onRevert: () => _revertFile(context, ref, f.path),
                  ),
                ),
                if (generated.isNotEmpty)
                  ExpansionTile(
                    title: Text(
                      'Generated files (${generated.length})',
                      style: context.text.medium14
                          .copyWith(color: context.colors.muted),
                    ),
                    children: generated
                        .map(
                          (f) => _FileTile(
                            taskId: taskId,
                            file: f,
                            onRevert: () => _revertFile(context, ref, f.path),
                          ),
                        )
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
  const _FileTile(
      {required this.taskId, required this.file, required this.onRevert});

  final String taskId;
  final DiffFileSummary file;
  final VoidCallback onRevert;

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
      onLongPress: onRevert,
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
