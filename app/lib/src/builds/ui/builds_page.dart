import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/extension/context.dart';
import '../../security/biometric_gate.dart';
import '../../tasks/models/task_detail.dart';
import '../../tasks/providers/task_provider.dart';
import '../build_feed.dart';
import '../models/build_stream_state.dart';
import '../providers/build_actions.dart';
import '../providers/build_stream.dart';

/// Build & ship screen (S3-06): start a build for a task's reviewed worktree, watch the
/// live log, edit the generated release notes, pick tester groups, upload to Firebase App
/// Distribution, and get the release link. Retries a failed build.
@RoutePage()
class BuildsPage extends ConsumerStatefulWidget {
  const BuildsPage({required this.taskId, super.key});

  final String taskId;

  @override
  ConsumerState<BuildsPage> createState() => _BuildsPageState();
}

class _BuildsPageState extends ConsumerState<BuildsPage> {
  String? _buildId;
  bool _runCodegen = true;
  bool _busy = false;
  bool _resumeChecked = false;
  bool _notesLoaded = false;
  String? _notesSource;
  final TextEditingController _notes = TextEditingController();
  final TextEditingController _groups = TextEditingController();
  final ScrollController _scroll = ScrollController();

  @override
  void dispose() {
    _notes.dispose();
    _groups.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.jumpTo(_scroll.position.maxScrollExtent);
      }
    });
  }

  // Pick up a build already running/finished for this task when the screen opens.
  void _maybeResume(TaskDetail task) {
    if (_resumeChecked) return;
    _resumeChecked = true;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      try {
        final b = await ref
            .read(buildActionsProvider.notifier)
            .latestForTask(task.projectId, widget.taskId);
        if (mounted && b != null && _buildId == null) {
          setState(() => _buildId = b.id);
        }
      } catch (_) {
        // No prior build or offline — the start card handles it.
      }
    });
  }

  Future<void> _start(TaskDetail task) async {
    // Building is a sensitive action (CLAUDE.md) — gate behind biometric (S3-07).
    if (!await ensureBiometric(ref, context, 'Confirm to start a build')) {
      return;
    }
    setState(() => _busy = true);
    try {
      final b = await ref.read(buildActionsProvider.notifier).start(
            task.projectId,
            taskId: widget.taskId,
            runCodegen: _runCodegen,
          );
      if (mounted) {
        setState(() {
          _buildId = b.id;
          _notesLoaded = false;
          _notes.clear();
        });
      }
    } catch (e) {
      _snack('$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _cancel() async {
    final id = _buildId;
    if (id == null) return;
    try {
      await ref.read(buildActionsProvider.notifier).cancel(id);
    } catch (e) {
      _snack('$e');
    }
  }

  Future<void> _retry() async {
    final id = _buildId;
    if (id == null) return;
    if (!await ensureBiometric(ref, context, 'Confirm to retry the build')) {
      return;
    }
    setState(() => _busy = true);
    try {
      final b = await ref.read(buildActionsProvider.notifier).retry(id);
      if (mounted) {
        setState(() {
          _buildId = b.id;
          _notesLoaded = false;
          _notes.clear();
        });
      }
    } catch (e) {
      _snack('$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _loadNotes({bool force = false}) async {
    if (_notesLoaded && !force) return;
    _notesLoaded = true;
    try {
      final rn = await ref
          .read(buildActionsProvider.notifier)
          .releaseNotes(widget.taskId);
      if (mounted) {
        if (force || _notes.text.trim().isEmpty) _notes.text = rn.text;
        setState(() => _notesSource = rn.source);
      }
    } catch (_) {
      // Leave the field editable/empty; the user can type their own.
    }
  }

  Future<void> _upload() async {
    final id = _buildId;
    if (id == null) return;
    // Distribute is a sensitive action — gate behind biometric (S3-07).
    if (!await ensureBiometric(ref, context, 'Confirm to upload to testers')) {
      return;
    }
    final groups = _groups.text
        .split(',')
        .map((g) => g.trim())
        .where((g) => g.isNotEmpty)
        .toList();
    setState(() => _busy = true);
    try {
      await ref.read(buildActionsProvider.notifier).upload(
            id,
            releaseNotes: _notes.text.trim(),
            groups: groups.isEmpty ? null : groups,
          );
      _snack('Uploading to testers…');
    } catch (e) {
      _snack('$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final taskAsync = ref.watch(taskDetailProvider(widget.taskId));
    return Scaffold(
      appBar: AppBar(title: const Text('Build & ship')),
      body: taskAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => _centerText(context, '$e'),
        data: (task) => _body(context, task),
      ),
    );
  }

  Widget _body(BuildContext context, TaskDetail task) {
    if (_buildId == null) {
      _maybeResume(task);
      return _startView(context, task);
    }
    final provider = buildStreamProvider(_buildId!);
    ref.listen(
        provider.select((s) => s.lines.length), (_, __) => _scrollToEnd());
    final state = ref.watch(provider);
    if (state.succeeded) _loadNotes();

    return Column(
      children: [
        _header(context, state),
        if (state.error != null)
          _banner(context, state.error!, context.colors.red),
        Expanded(child: _logView(context, state)),
        _bottom(context, task, state),
      ],
    );
  }

  Widget _startView(BuildContext context, TaskDetail task) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Build this task', style: context.text.semibold16),
          const SizedBox(height: 8),
          Text(
            'Branch ${task.branch.isEmpty ? '—' : task.branch}',
            style: context.text.regular12.copyWith(color: context.colors.muted),
          ),
          const SizedBox(height: 16),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: _runCodegen,
            onChanged: _busy ? null : (v) => setState(() => _runCodegen = v),
            title: Text('Run codegen first', style: context.text.regular14),
            subtitle: Text(
              'pub get + build_runner before the APK build',
              style:
                  context.text.regular12.copyWith(color: context.colors.muted),
            ),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: _busy ? null : () => _start(task),
              icon: _busy
                  ? const SizedBox(
                      height: 16,
                      width: 16,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.rocket_launch_outlined),
              label: const Text('Start build'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _header(BuildContext context, BuildStreamState state) {
    final label = state.isUploading
        ? 'uploading'
        : state.uploaded
            ? 'uploaded'
            : state.status;
    final color = _statusColor(context, label);
    return Container(
      width: double.infinity,
      color: context.colors.surface,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(label,
                style: context.text.regular12.copyWith(color: color)),
          ),
          const Spacer(),
          if (!state.connected)
            Text('reconnecting…',
                style: context.text.regular12
                    .copyWith(color: context.colors.muted)),
        ],
      ),
    );
  }

  Widget _logView(BuildContext context, BuildStreamState state) {
    if (state.lines.isEmpty) {
      return Center(
        child: Text(
          state.connected ? 'Waiting for output…' : 'Connecting…',
          style: context.text.regular14.copyWith(color: context.colors.muted),
        ),
      );
    }
    return ListView.builder(
      controller: _scroll,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      itemCount: state.lines.length,
      itemBuilder: (_, i) => _lineTile(context, state.lines[i]),
    );
  }

  Widget _lineTile(BuildContext context, BuildLine line) {
    switch (line.kind) {
      case BuildLineKind.step:
        return Padding(
          padding: const EdgeInsets.only(top: 10, bottom: 4),
          child: Text(line.text,
              style:
                  context.text.medium14.copyWith(color: context.colors.accent)),
        );
      case BuildLineKind.success:
        return _note(context, line.text, context.colors.green,
            Icons.check_circle_outline);
      case BuildLineKind.error:
        return _note(
            context, line.text, context.colors.red, Icons.error_outline);
      case BuildLineKind.lifecycle:
        return _note(
            context, line.text, context.colors.muted, Icons.info_outline);
      case BuildLineKind.log:
        return Text(
          line.text,
          style: context.text.regular12.copyWith(
              fontFamily: 'monospace', color: context.colors.onSurface),
        );
    }
  }

  Widget _note(BuildContext context, String text, Color color, IconData icon) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: 8),
          Expanded(
              child: Text(text,
                  style: context.text.regular14.copyWith(color: color))),
        ],
      ),
    );
  }

  Widget _bottom(
      BuildContext context, TaskDetail task, BuildStreamState state) {
    if (state.isBuilding) {
      return _barButton(
          context, 'Stop build', Icons.stop, context.colors.red, _cancel);
    }
    if (state.failed || state.cancelled) {
      return _barButton(context, 'Retry build', Icons.refresh,
          context.colors.primary, _busy ? null : _retry);
    }
    if (state.succeeded) {
      if (state.uploaded) return _uploadedPanel(context, state);
      return _releasePanel(context, state);
    }
    return const SizedBox.shrink();
  }

  Widget _releasePanel(BuildContext context, BuildStreamState state) {
    return SafeArea(
      top: false,
      child: Container(
        decoration: BoxDecoration(
          color: context.colors.surface,
          border: Border(top: BorderSide(color: context.colors.border)),
        ),
        padding: const EdgeInsets.all(12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text('Release notes', style: context.text.medium14),
                if (_notesSource != null) ...[
                  const SizedBox(width: 8),
                  Text(
                      '(${_notesSource == 'session' ? 'from Claude' : 'from diff'})',
                      style: context.text.regular12
                          .copyWith(color: context.colors.muted)),
                ],
                const Spacer(),
                TextButton.icon(
                  onPressed: _busy ? null : () => _loadNotes(force: true),
                  icon: const Icon(Icons.auto_awesome, size: 16),
                  label: const Text('Regenerate'),
                ),
              ],
            ),
            TextField(
              controller: _notes,
              minLines: 2,
              maxLines: 6,
              style: context.text.regular14,
              decoration: const InputDecoration(
                hintText: '- What testers should know…',
                border: OutlineInputBorder(),
                isDense: true,
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _groups,
              style: context.text.regular14,
              decoration: const InputDecoration(
                labelText: 'Tester groups (comma-separated)',
                hintText: 'leave empty to use the project default',
                border: OutlineInputBorder(),
                isDense: true,
              ),
            ),
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: (_busy || state.isUploading) ? null : _upload,
                icon: state.isUploading
                    ? const SizedBox(
                        height: 16,
                        width: 16,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.cloud_upload_outlined),
                label: Text(
                    state.isUploading ? 'Uploading…' : 'Upload to testers'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _uploadedPanel(BuildContext context, BuildStreamState state) {
    final url = state.releaseUrl;
    return SafeArea(
      top: false,
      child: Container(
        decoration: BoxDecoration(
          color: context.colors.surface,
          border: Border(top: BorderSide(color: context.colors.border)),
        ),
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.check_circle, size: 18, color: context.colors.green),
                const SizedBox(width: 8),
                Text('Shipped to testers', style: context.text.medium14),
              ],
            ),
            if (url != null) ...[
              const SizedBox(height: 10),
              SelectableText(url,
                  style: context.text.regular12
                      .copyWith(color: context.colors.primary)),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: () async {
                  await Clipboard.setData(ClipboardData(text: url));
                  _snack('Link copied');
                },
                icon: const Icon(Icons.copy, size: 16),
                label: const Text('Copy Firebase link'),
              ),
            ] else
              Text('Open the Firebase console to view the release.',
                  style: context.text.regular12
                      .copyWith(color: context.colors.muted)),
          ],
        ),
      ),
    );
  }

  Widget _barButton(BuildContext context, String label, IconData icon,
      Color color, VoidCallback? onTap) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            style: FilledButton.styleFrom(backgroundColor: color),
            onPressed: onTap,
            icon: Icon(icon),
            label: Text(label),
          ),
        ),
      ),
    );
  }

  Color _statusColor(BuildContext context, String label) => switch (label) {
        'succeeded' || 'uploaded' => context.colors.green,
        'failed' || 'cancelled' => context.colors.red,
        'running' || 'queued' => context.colors.primary,
        'uploading' => context.colors.accent,
        _ => context.colors.muted,
      };

  Widget _banner(BuildContext context, String text, Color color) => Container(
        width: double.infinity,
        color: color.withValues(alpha: 0.12),
        padding: const EdgeInsets.all(12),
        child: Text(text, style: context.text.regular12.copyWith(color: color)),
      );

  Widget _centerText(BuildContext context, String text) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(text, style: context.text.regular14),
        ),
      );
}
