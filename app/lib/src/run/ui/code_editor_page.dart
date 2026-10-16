import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/extension/context.dart';
import '../../review/providers/diff_providers.dart';
import '../providers/run_actions.dart';

/// Manual code editor (S5-12): load a file from the task's checkout, edit it, and save. The save
/// writes through the path-safe daemon endpoint and, if a live run is on the task's branch, triggers
/// a hot reload. Editing only works while the task's branch is checked out (i.e. during a run).
@RoutePage()
class CodeEditorPage extends ConsumerStatefulWidget {
  const CodeEditorPage({required this.taskId, required this.path, super.key});

  final String taskId;
  final String path;

  @override
  ConsumerState<CodeEditorPage> createState() => _CodeEditorPageState();
}

class _CodeEditorPageState extends ConsumerState<CodeEditorPage> {
  final TextEditingController _ctrl = TextEditingController();
  bool _loaded = false;
  bool _busy = false;
  bool _dirty = false;

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    try {
      final reloaded = await ref
          .read(runActionsProvider.notifier)
          .writeFile(widget.taskId, widget.path, _ctrl.text);
      // Refresh the read-only views that cache this file / the diff summary.
      ref.invalidate(fileContentProvider(widget.taskId, widget.path));
      ref.invalidate(diffSummaryProvider(widget.taskId));
      if (mounted) setState(() => _dirty = false);
      _snack(reloaded ? 'Saved — hot reloading…' : 'Saved');
    } catch (e) {
      _snack('$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final fileAsync = ref.watch(fileContentProvider(widget.taskId, widget.path));
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.path.split('/').last),
        actions: [
          if (_busy)
            const Padding(
              padding: EdgeInsets.all(14),
              child: SizedBox(
                  height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2)),
            )
          else
            TextButton(
              onPressed: _dirty ? _save : null,
              child: const Text('Save'),
            ),
        ],
      ),
      body: fileAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => _centered(context, '$e'),
        data: (file) {
          if (file.binary) {
            return _centered(context, 'Binary file — can\'t edit here.');
          }
          if (file.truncated) {
            return _centered(
                context, 'File too large to edit safely (truncated). Edit it via Claude instead.');
          }
          if (!_loaded) {
            _loaded = true;
            _ctrl.text = file.content ?? '';
          }
          return Column(
            children: [
              Expanded(
                child: TextField(
                  controller: _ctrl,
                  onChanged: (_) {
                    if (!_dirty) setState(() => _dirty = true);
                  },
                  maxLines: null,
                  expands: true,
                  keyboardType: TextInputType.multiline,
                  textAlignVertical: TextAlignVertical.top,
                  style: context.text.regular12.copyWith(fontFamily: 'monospace'),
                  decoration: const InputDecoration(
                    contentPadding: EdgeInsets.all(12),
                    border: InputBorder.none,
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _centered(BuildContext context, String text) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(text, style: context.text.regular14),
        ),
      );
}
