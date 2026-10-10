import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/extension/context.dart';
import '../../routes/app_router.dart';
import '../../security/biometric_gate.dart';
import '../models/pending_approval.dart';
import '../models/task_stream_state.dart';
import '../providers/task_stream.dart';
import '../task_feed.dart';

/// Live task view (S1-10): streamed text + tool-call cards over the daemon WebSocket,
/// with reconnect/replay and a stop button.
@RoutePage()
class TaskPage extends ConsumerStatefulWidget {
  const TaskPage({required this.taskId, super.key});

  final String taskId;

  @override
  ConsumerState<TaskPage> createState() => _TaskPageState();
}

class _TaskPageState extends ConsumerState<TaskPage> {
  final ScrollController _scroll = ScrollController();

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  // "Always allow" is a sensitive action — gate behind biometric (S3-07).
  Future<void> _alwaysAllow(String toolName) async {
    if (!await ensureBiometric(
        ref, context, 'Confirm to always allow $toolName')) {
      return;
    }
    ref.read(taskStreamProvider(widget.taskId).notifier).alwaysAllow(toolName);
  }

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(
          _scroll.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final provider = taskStreamProvider(widget.taskId);
    // Autoscroll when new items arrive.
    ref.listen(
        provider.select((s) => s.items.length), (_, __) => _scrollToEnd());
    final state = ref.watch(provider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Task'),
        actions: [
          IconButton(
            tooltip: 'Review changes',
            icon: const Icon(Icons.rate_review_outlined),
            onPressed: () =>
                context.router.push(ReviewRoute(taskId: widget.taskId)),
          ),
          IconButton(
            tooltip: 'Build & ship',
            icon: const Icon(Icons.rocket_launch_outlined),
            onPressed: () =>
                context.router.push(BuildsRoute(taskId: widget.taskId)),
          ),
          _StatusChip(status: state.status),
        ],
      ),
      body: Column(
        children: [
          if (!state.connected && !state.isTerminal) _connectingBanner(context),
          if (state.error != null) _errorBanner(context, state.error!),
          for (final p in state.pending)
            _ApprovalCard(
              approval: p,
              onDecide: (allow, reason) => ref
                  .read(provider.notifier)
                  .decide(p.toolUseId, allow: allow, reason: reason),
              onAlwaysAllow: () => _alwaysAllow(p.toolName),
            ),
          Expanded(
            child: state.items.isEmpty
                ? Center(
                    child: Text(
                      state.connected ? 'Waiting for output…' : 'Connecting…',
                      style: context.text.regular14.copyWith(
                        color: context.colors.muted,
                      ),
                    ),
                  )
                : ListView.builder(
                    controller: _scroll,
                    padding: const EdgeInsets.all(12),
                    itemCount: state.items.length,
                    itemBuilder: (_, i) => _FeedTile(item: state.items[i]),
                  ),
          ),
        ],
      ),
      bottomNavigationBar: state.isRunning ? _stopBar(context, state) : null,
    );
  }

  Widget _connectingBanner(BuildContext context) => Container(
        width: double.infinity,
        color: context.colors.surface,
        padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 16),
        child: Text(
          'Reconnecting…',
          style: context.text.regular12.copyWith(color: context.colors.muted),
        ),
      );

  Widget _errorBanner(BuildContext context, String error) => Container(
        width: double.infinity,
        color: context.colors.red.withValues(alpha: 0.12),
        padding: const EdgeInsets.all(12),
        child: Text(
          error,
          style: context.text.regular12.copyWith(color: context.colors.red),
        ),
      );

  Widget _stopBar(BuildContext context, TaskStreamState state) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: FilledButton.icon(
            style: FilledButton.styleFrom(backgroundColor: context.colors.red),
            onPressed: () => ref
                .read(taskStreamProvider(widget.taskId).notifier)
                .cancel(widget.taskId),
            icon: const Icon(Icons.stop),
            label: const Text('Stop task'),
          ),
        ),
      );
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final color = switch (status) {
      'done' => context.colors.green,
      'failed' || 'cancelled' => context.colors.red,
      'running' || 'queued' || 'waiting' => context.colors.primary,
      _ => context.colors.muted,
    };
    return Center(
      child: Container(
        margin: const EdgeInsets.only(right: 12),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(
          status,
          style: context.text.regular12.copyWith(color: color),
        ),
      ),
    );
  }
}

class _FeedTile extends StatelessWidget {
  const _FeedTile({required this.item});

  final FeedItem item;

  @override
  Widget build(BuildContext context) {
    switch (item.kind) {
      case FeedKind.lifecycle:
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Center(
            child: Text(
              item.body == null ? item.title : '${item.title} · ${item.body}',
              style:
                  context.text.regular12.copyWith(color: context.colors.muted),
            ),
          ),
        );
      case FeedKind.tool:
        return _card(
          context,
          icon: Icons.build_outlined,
          color: context.colors.accent,
          title: item.title,
          body: item.body,
          mono: true,
        );
      case FeedKind.result:
        return _card(
          context,
          icon: Icons.check_circle_outline,
          color: context.colors.green,
          title: item.title,
          body: item.body,
        );
      case FeedKind.error:
        return _card(
          context,
          icon: Icons.error_outline,
          color: context.colors.red,
          title: item.title,
          body: item.body,
        );
      case FeedKind.assistant:
      case FeedKind.info:
        return _card(
          context,
          icon: Icons.smart_toy_outlined,
          color: context.colors.primary,
          title: item.title,
          body: item.body,
        );
    }
  }

  Widget _card(
    BuildContext context, {
    required IconData icon,
    required Color color,
    required String title,
    String? body,
    bool mono = false,
  }) {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 6),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: context.colors.surface,
        border: Border.all(color: context.colors.border),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 16, color: color),
              const SizedBox(width: 8),
              Expanded(child: Text(title, style: context.text.medium14)),
            ],
          ),
          if (body != null && body.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              body,
              style: mono
                  ? context.text.regular12.copyWith(
                      fontFamily: 'monospace', color: context.colors.muted)
                  : context.text.regular14,
            ),
          ],
        ],
      ),
    );
  }
}

/// A parked tool call awaiting the user's decision (S2-04):
/// Allow once · Always · Deny (with optional reason).
class _ApprovalCard extends StatelessWidget {
  const _ApprovalCard({
    required this.approval,
    required this.onDecide,
    required this.onAlwaysAllow,
  });

  final PendingApproval approval;
  final void Function(bool allow, String? reason) onDecide;
  final VoidCallback onAlwaysAllow;

  Future<void> _deny(BuildContext context) async {
    final controller = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Deny tool'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(
            labelText: 'Reason (optional)',
            hintText: 'Why, or what to do instead',
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Deny')),
        ],
      ),
    );
    if (confirmed ?? false) {
      onDecide(false, controller.text.trim());
    }
    controller.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 10, 12, 2),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: context.colors.primary.withValues(alpha: 0.08),
        border: Border.all(color: context.colors.primary),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.lock_outline, size: 16, color: context.colors.primary),
              const SizedBox(width: 8),
              Expanded(
                child: Text('Allow ${approval.toolName}?',
                    style: context.text.semibold16),
              ),
            ],
          ),
          if (approval.summary.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              approval.summary,
              maxLines: 4,
              overflow: TextOverflow.ellipsis,
              style: context.text.regular12.copyWith(
                fontFamily: 'monospace',
                color: context.colors.onSurface,
              ),
            ),
          ],
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              FilledButton(
                onPressed: () => onDecide(true, null),
                child: const Text('Allow once'),
              ),
              OutlinedButton(
                onPressed: onAlwaysAllow,
                child: const Text('Always'),
              ),
              TextButton(
                onPressed: () => _deny(context),
                style:
                    TextButton.styleFrom(foregroundColor: context.colors.red),
                child: const Text('Deny'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
