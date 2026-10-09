import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/extension/context.dart';
import '../../routes/app_router.dart';
import '../providers/new_task_controller.dart';

/// Enter a prompt and start a Claude Code task on the selected project.
@RoutePage()
class NewTaskPage extends ConsumerStatefulWidget {
  const NewTaskPage({
    required this.projectId,
    required this.projectName,
    super.key,
  });

  final String projectId;
  final String projectName;

  @override
  ConsumerState<NewTaskPage> createState() => _NewTaskPageState();
}

class _NewTaskPageState extends ConsumerState<NewTaskPage> {
  final TextEditingController _promptCtrl = TextEditingController();

  @override
  void dispose() {
    _promptCtrl.dispose();
    super.dispose();
  }

  Future<void> _start() async {
    final prompt = _promptCtrl.text.trim();
    if (prompt.isEmpty) return;
    final started = await ref
        .read(newTaskControllerProvider.notifier)
        .create(widget.projectId, prompt);
    if (!mounted || started == null) return;
    await context.router.replace(TaskRoute(taskId: started.taskId));
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(newTaskControllerProvider);
    ref.listen(newTaskControllerProvider, (_, next) {
      if (next.hasError && mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('${next.error}')));
      }
    });
    final busy = state.isLoading;

    return Scaffold(
      appBar: AppBar(title: Text('New task · ${widget.projectName}')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('What should Claude do?', style: context.text.semibold16),
            const SizedBox(height: 12),
            TextField(
              controller: _promptCtrl,
              autofocus: true,
              minLines: 4,
              maxLines: 10,
              textInputAction: TextInputAction.newline,
              decoration: const InputDecoration(
                hintText: 'e.g. Add a staging banner to the home screen',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: busy ? null : _start,
              child: busy
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Start task'),
            ),
          ],
        ),
      ),
    );
  }
}
