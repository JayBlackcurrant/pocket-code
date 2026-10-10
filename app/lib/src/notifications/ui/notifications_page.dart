import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/extension/context.dart';
import '../../routes/app_router.dart';
import '../models/app_notification.dart';
import '../providers/notifications_stream.dart';

/// Notifications inbox (S3-05). Shows daemon-derived notifications (approvals, task/build/
/// upload outcomes), live over the tailnet; tapping one deep-links to its task.
@RoutePage()
class NotificationsPage extends ConsumerStatefulWidget {
  const NotificationsPage({super.key});

  @override
  ConsumerState<NotificationsPage> createState() => _NotificationsPageState();
}

class _NotificationsPageState extends ConsumerState<NotificationsPage> {
  @override
  void initState() {
    super.initState();
    // Opening the inbox clears the unread badge.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(notificationsStreamProvider.notifier).markAllRead();
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(notificationsStreamProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Notifications')),
      body: state.items.isEmpty
          ? Center(
              child: Text(
                'Nothing yet.',
                style: context.text.regular14
                    .copyWith(color: context.colors.muted),
              ),
            )
          : ListView.separated(
              itemCount: state.items.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (_, i) => _tile(context, state.items[i]),
            ),
    );
  }

  Widget _tile(BuildContext context, AppNotification n) {
    final (icon, color) = _style(context, n.kind);
    return ListTile(
      leading: Icon(icon, color: color),
      title: Text(n.title, style: context.text.semibold16),
      subtitle: Text(n.body, style: context.text.regular12),
      trailing: n.read
          ? null
          : Icon(Icons.circle, size: 10, color: context.colors.primary),
      onTap: n.taskId == null
          ? null
          : () => context.router.push(TaskRoute(taskId: n.taskId!)),
    );
  }

  (IconData, Color) _style(BuildContext context, String kind) => switch (kind) {
        'approval' => (Icons.lock_outline, context.colors.primary),
        'taskDone' => (Icons.check_circle_outline, context.colors.green),
        'buildReady' => (Icons.rocket_launch_outlined, context.colors.green),
        'shipped' => (Icons.cloud_done_outlined, context.colors.green),
        'taskFailed' || 'buildFailed' || 'uploadFailed' => (
            Icons.error_outline,
            context.colors.red,
          ),
        _ => (Icons.notifications_none, context.colors.muted),
      };
}
