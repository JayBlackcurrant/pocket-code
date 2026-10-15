import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/extension/context.dart';
import '../../tasks/models/task_detail.dart';
import '../../tasks/providers/task_provider.dart';
import '../models/device.dart';
import '../models/run_stream_state.dart';
import '../providers/run_actions.dart';
import '../providers/run_stream.dart';
import '../run_feed.dart';
import '../tailnet.dart';

/// Live run screen (S5-09): discover the phone over the tailnet (adb connect cascade), start
/// `flutter run` on it, then watch the live log and drive Hot reload / Hot restart / Stop — the
/// Flutter IDE toolbar, on your real phone. The app itself shows on the phone (switch to it);
/// PocketCode holds the controls.
@RoutePage()
class RunPage extends ConsumerStatefulWidget {
  const RunPage({required this.taskId, super.key});

  final String taskId;

  @override
  ConsumerState<RunPage> createState() => _RunPageState();
}

class _RunPageState extends ConsumerState<RunPage> {
  String? _runId;
  bool _busy = false;
  bool _resumeChecked = false;
  bool _discovering = false;
  String? _host;
  String? _error;
  DeviceDiscovery? _discovery;
  final TextEditingController _hostCtrl = TextEditingController();
  final ScrollController _scroll = ScrollController();

  @override
  void dispose() {
    _hostCtrl.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) _scroll.jumpTo(_scroll.position.maxScrollExtent);
    });
  }

  // Adopt a run already active for this task when the screen opens.
  void _maybeResume(TaskDetail task) {
    if (_resumeChecked) return;
    _resumeChecked = true;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      try {
        final r = await ref
            .read(runActionsProvider.notifier)
            .activeForTask(task.projectId, widget.taskId);
        if (mounted && r != null && _runId == null) {
          setState(() => _runId = r.id);
        } else {
          _discover(task.projectId);
        }
      } catch (_) {
        _discover(task.projectId);
      }
    });
  }

  Future<void> _discover(String projectId, {String? host}) async {
    if (_discovering) return;
    setState(() {
      _discovering = true;
      _error = null;
    });
    try {
      final h = host ?? _host ?? await detectTailnetHost();
      if (h == null) {
        setState(() {
          _discovering = false;
          _error = 'Could not find this phone\'s Tailscale IP. Enter it below.';
        });
        return;
      }
      _host = h;
      final d =
          await ref.read(runActionsProvider.notifier).devices(projectId, h);
      if (mounted) setState(() => _discovery = d);
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _discovering = false);
    }
  }

  Future<void> _start(TaskDetail task) async {
    final serial = _discovery?.primary?.serial;
    if (serial == null) return;
    setState(() => _busy = true);
    try {
      final r = await ref.read(runActionsProvider.notifier).start(
            task.projectId,
            deviceSerial: serial,
            taskId: widget.taskId,
          );
      if (mounted) setState(() => _runId = r.id);
    } catch (e) {
      _snack('$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _control(String kind) async {
    final id = _runId;
    if (id == null) return;
    try {
      final actions = ref.read(runActionsProvider.notifier);
      final res =
          kind == 'reload' ? await actions.reload(id) : await actions.restart(id);
      _snack(res.ok ? (res.message ?? 'Done') : 'Failed: ${res.message ?? ''}');
    } catch (e) {
      _snack('$e');
    }
  }

  Future<void> _stop() async {
    final id = _runId;
    if (id == null) return;
    try {
      await ref.read(runActionsProvider.notifier).stop(id);
      _snack('Stopping…');
    } catch (e) {
      _snack('$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final taskAsync = ref.watch(taskDetailProvider(widget.taskId));
    return Scaffold(
      appBar: AppBar(
        title: const Text('Run on phone'),
        actions: [
          if (_runId != null)
            IconButton(
              tooltip: 'Switch to the app',
              icon: const Icon(Icons.phone_android),
              onPressed: () => _snack(
                  'Your app is running on this phone — use the app switcher to view it.'),
            ),
        ],
      ),
      body: taskAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => _centerText('$e'),
        data: (task) => _body(context, task),
      ),
    );
  }

  Widget _body(BuildContext context, TaskDetail task) {
    if (_runId == null) {
      _maybeResume(task);
      return _setupView(context, task);
    }
    final provider = runStreamProvider(_runId!);
    ref.listen(provider.select((s) => s.lines.length), (_, __) => _scrollToEnd());
    final state = ref.watch(provider);
    return Column(
      children: [
        _header(context, state),
        if (state.error != null) _banner(context, state.error!, context.colors.red),
        Expanded(child: _logView(context, state)),
        _controlBar(context, state),
      ],
    );
  }

  // --- setup (discover + start) ---------------------------------------------

  Widget _setupView(BuildContext context, TaskDetail task) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Run this task live', style: context.text.semibold16),
          const SizedBox(height: 4),
          Text(
            'Branch ${task.branch.isEmpty ? '—' : task.branch}',
            style: context.text.regular12.copyWith(color: context.colors.muted),
          ),
          const SizedBox(height: 16),
          if (_discovering)
            const Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: CircularProgressIndicator()),
            )
          else ...[
            if (_discovery != null && _discovery!.reArmNeeded)
              _reArmCard(context, task)
            else if (_discovery != null && _discovery!.connected)
              _deviceCard(context, task)
            else
              _hostEntry(context, task),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!,
                  style:
                      context.text.regular12.copyWith(color: context.colors.red)),
            ],
          ],
        ],
      ),
    );
  }

  Widget _deviceCard(BuildContext context, TaskDetail task) {
    final d = _discovery!;
    final dev = d.primary!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          Icon(Icons.phone_android, size: 18, color: context.colors.green),
          const SizedBox(width: 8),
          Expanded(
            child: Text(dev.name ?? dev.serial, style: context.text.medium14),
          ),
          _qualityChip(context, d.quality),
        ]),
        const SizedBox(height: 4),
        Text(dev.serial,
            style: context.text.regular12.copyWith(color: context.colors.muted)),
        if (!dev.flutterVisible) ...[
          const SizedBox(height: 8),
          Text('Connected via adb, but Flutter doesn\'t list it yet — Run may still work.',
              style:
                  context.text.regular12.copyWith(color: context.colors.muted)),
        ],
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
                : const Icon(Icons.play_arrow),
            label: const Text('Run'),
          ),
        ),
        const SizedBox(height: 8),
        TextButton.icon(
          onPressed:
              _discovering ? null : () => _discover(task.projectId, host: _host),
          icon: const Icon(Icons.refresh, size: 16),
          label: const Text('Re-check device'),
        ),
      ],
    );
  }

  Widget _reArmCard(BuildContext context, TaskDetail task) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          Icon(Icons.usb_off, size: 18, color: context.colors.primary),
          const SizedBox(width: 8),
          Text('Phone needs re-arming', style: context.text.medium14),
        ]),
        const SizedBox(height: 8),
        Text(
          'adb isn\'t reachable on your phone (it won\'t auto-start after a reboot). '
          'Re-arm it, then re-check:\n'
          '• On Wi-Fi: Developer options → Wireless debugging ON, or\n'
          '• Plug into the Mac once and run: adb tcpip 5555',
          style: context.text.regular14.copyWith(color: context.colors.muted),
        ),
        const SizedBox(height: 16),
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed:
                _discovering ? null : () => _discover(task.projectId, host: _host),
            icon: const Icon(Icons.refresh),
            label: const Text('Re-check'),
          ),
        ),
      ],
    );
  }

  Widget _hostEntry(BuildContext context, TaskDetail task) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Phone Tailscale IP', style: context.text.medium14),
        const SizedBox(height: 8),
        TextField(
          controller: _hostCtrl,
          keyboardType: TextInputType.text,
          style: context.text.regular14,
          decoration: const InputDecoration(
            hintText: 'e.g. 100.x.y.z',
            border: OutlineInputBorder(),
            isDense: true,
          ),
        ),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: _discovering
                ? null
                : () {
                    final h = _hostCtrl.text.trim();
                    if (h.isEmpty) return;
                    _discover(task.projectId, host: h);
                  },
            icon: const Icon(Icons.search),
            label: const Text('Find device'),
          ),
        ),
      ],
    );
  }

  // --- live view ------------------------------------------------------------

  Widget _header(BuildContext context, RunStreamState state) {
    final color = _statusColor(context, state.status);
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
            child: Text(state.status,
                style: context.text.regular12.copyWith(color: color)),
          ),
          if (_discovery != null) ...[
            const SizedBox(width: 8),
            _qualityChip(context, _discovery!.quality),
          ],
          const Spacer(),
          if (!state.connected)
            Text('reconnecting…',
                style: context.text.regular12
                    .copyWith(color: context.colors.muted)),
        ],
      ),
    );
  }

  Widget _qualityChip(BuildContext context, String quality) {
    final color = quality == 'direct'
        ? context.colors.green
        : quality == 'relay'
            ? context.colors.accent
            : context.colors.muted;
    final label = quality == 'relay' ? 'relay (laggy)' : quality;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(10),
      ),
      child:
          Text(label, style: context.text.regular12.copyWith(color: color)),
    );
  }

  Widget _logView(BuildContext context, RunStreamState state) {
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

  Widget _lineTile(BuildContext context, RunLine line) {
    switch (line.kind) {
      case RunLineKind.reload:
        return _note(context, line.text, context.colors.accent, Icons.sync);
      case RunLineKind.success:
        return _note(
            context, line.text, context.colors.green, Icons.check_circle_outline);
      case RunLineKind.error:
        return _note(context, line.text, context.colors.red, Icons.error_outline);
      case RunLineKind.lifecycle:
        return _note(
            context, line.text, context.colors.muted, Icons.info_outline);
      case RunLineKind.log:
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

  Widget _controlBar(BuildContext context, RunStreamState state) {
    if (state.stopped || state.failed) {
      return _bar(
        context,
        FilledButton.icon(
          onPressed: () => setState(() => _runId = null),
          icon: const Icon(Icons.play_arrow),
          label: const Text('Start another run'),
        ),
      );
    }
    final busy = state.reloading;
    return _bar(
      context,
      Row(
        children: [
          Expanded(
            child: OutlinedButton.icon(
              onPressed: busy ? null : () => _control('reload'),
              icon: const Icon(Icons.bolt, size: 18),
              label: const Text('Reload'),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: OutlinedButton.icon(
              onPressed: busy ? null : () => _control('restart'),
              icon: const Icon(Icons.restart_alt, size: 18),
              label: const Text('Restart'),
            ),
          ),
          const SizedBox(width: 8),
          IconButton.filled(
            tooltip: 'Stop',
            style: IconButton.styleFrom(backgroundColor: context.colors.red),
            onPressed: _stop,
            icon: const Icon(Icons.stop),
          ),
        ],
      ),
    );
  }

  Widget _bar(BuildContext context, Widget child) {
    return SafeArea(
      top: false,
      child: Container(
        decoration: BoxDecoration(
          color: context.colors.surface,
          border: Border(top: BorderSide(color: context.colors.border)),
        ),
        padding: const EdgeInsets.all(12),
        child: child,
      ),
    );
  }

  Color _statusColor(BuildContext context, String s) => switch (s) {
        'running' => context.colors.green,
        'reloading' => context.colors.accent,
        'starting' || 'connecting' => context.colors.primary,
        'failed' => context.colors.red,
        _ => context.colors.muted,
      };

  Widget _banner(BuildContext context, String text, Color color) => Container(
        width: double.infinity,
        color: color.withValues(alpha: 0.12),
        padding: const EdgeInsets.all(12),
        child: Text(text, style: context.text.regular12.copyWith(color: color)),
      );

  Widget _centerText(String text) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(text, style: context.text.regular14),
        ),
      );
}
