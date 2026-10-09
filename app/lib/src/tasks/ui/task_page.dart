import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/extension/context.dart';
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
        actions: [_StatusChip(status: state.status)],
      ),
      body: Column(
        children: [
          if (!state.connected && !state.isTerminal) _connectingBanner(context),
          if (state.error != null) _errorBanner(context, state.error!),
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
