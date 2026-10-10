import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/extension/context.dart';
import '../../routes/app_router.dart';
import '../../tasks/providers/new_task_controller.dart';
import '../mention.dart';
import '../models/tree_entry.dart';
import '../providers/project_providers.dart';

/// Browse a project's files and start a task with an attached-file prompt.
@RoutePage()
class ProjectPage extends ConsumerStatefulWidget {
  const ProjectPage(
      {required this.projectId, required this.projectName, super.key});

  final String projectId;
  final String projectName;

  @override
  ConsumerState<ProjectPage> createState() => _ProjectPageState();
}

class _ProjectPageState extends ConsumerState<ProjectPage> {
  final TextEditingController _prompt = TextEditingController();
  String _dir = ''; // current directory, relative to repo root
  final List<String> _attachments = [];
  ActiveMention? _mention; // active @mention the cursor is in, if any

  @override
  void initState() {
    super.initState();
    _prompt.addListener(_onPromptChanged);
  }

  @override
  void dispose() {
    _prompt.removeListener(_onPromptChanged);
    _prompt.dispose();
    super.dispose();
  }

  void _onPromptChanged() {
    final sel = _prompt.selection;
    final cursor = sel.isValid ? sel.baseOffset : _prompt.text.length;
    final next = parseActiveMention(_prompt.text, cursor);
    final changed =
        next?.start != _mention?.start || next?.query != _mention?.query;
    if (changed) setState(() => _mention = next);
  }

  void _selectSuggestion(String path) {
    final m = _mention;
    if (m == null) return;
    final end = m.start + 1 + m.query.length;
    final newText = _prompt.text.replaceRange(m.start, end, '');
    _prompt.value = TextEditingValue(
      text: newText,
      selection: TextSelection.collapsed(offset: m.start),
    );
    setState(() {
      if (!_attachments.contains(path)) _attachments.add(path);
      _mention = null;
    });
  }

  void _openDir(String path) => setState(() => _dir = path);

  void _up() {
    final i = _dir.lastIndexOf('/');
    setState(() => _dir = i == -1 ? '' : _dir.substring(0, i));
  }

  void _toggleAttach(String path) {
    setState(() {
      if (_attachments.contains(path)) {
        _attachments.remove(path);
      } else {
        _attachments.add(path);
      }
    });
  }

  Future<void> _send() async {
    final msg = _prompt.text.trim();
    if (msg.isEmpty) return;
    final prompt = _attachments.isEmpty
        ? msg
        : 'Please consider these files:\n${_attachments.map((p) => '- $p').join('\n')}\n\n$msg';
    final started = await ref
        .read(newTaskControllerProvider.notifier)
        .create(widget.projectId, prompt);
    if (!mounted || started == null) return;
    await context.router.push(TaskRoute(taskId: started.taskId));
  }

  @override
  Widget build(BuildContext context) {
    final tree = ref.watch(projectTreeProvider(widget.projectId, _dir));
    final creating = ref.watch(newTaskControllerProvider).isLoading;
    ref.listen(newTaskControllerProvider, (_, next) {
      if (next.hasError && mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('${next.error}')));
      }
    });

    return Scaffold(
      appBar: AppBar(title: Text(widget.projectName)),
      body: Column(
        children: [
          _breadcrumb(context),
          Expanded(
            child: tree.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => ListView(
                children: [
                  Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text('$e', style: context.text.regular14),
                  ),
                ],
              ),
              data: (entries) => ListView.builder(
                itemCount: entries.length,
                itemBuilder: (_, i) => _entryTile(context, entries[i]),
              ),
            ),
          ),
          if (_mention != null) _suggestions(context),
          _composer(context, creating),
        ],
      ),
    );
  }

  Widget _breadcrumb(BuildContext context) {
    return Container(
      width: double.infinity,
      color: context.colors.surface,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(
        children: [
          if (_dir.isNotEmpty)
            IconButton(
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(),
              icon: const Icon(Icons.arrow_upward, size: 18),
              onPressed: _up,
            ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              _dir.isEmpty ? '/' : '/$_dir',
              style:
                  context.text.regular12.copyWith(color: context.colors.muted),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }

  Widget _entryTile(BuildContext context, TreeEntry e) {
    final attached = _attachments.contains(e.path);
    return ListTile(
      dense: true,
      leading: Icon(
        e.isDir ? Icons.folder_outlined : Icons.insert_drive_file_outlined,
        color: e.isDir ? context.colors.accent : context.colors.muted,
        size: 20,
      ),
      title: Text(e.name, style: context.text.regular14),
      trailing: e.isDir
          ? const Icon(Icons.chevron_right, size: 18)
          : IconButton(
              icon: Icon(
                attached ? Icons.attach_file : Icons.add,
                size: 18,
                color: attached ? context.colors.primary : context.colors.muted,
              ),
              tooltip: attached ? 'Remove attachment' : 'Attach to prompt',
              onPressed: () => _toggleAttach(e.path),
            ),
      onTap: e.isDir
          ? () => _openDir(e.path)
          : () => context.router.push(
                ProjectFileRoute(projectId: widget.projectId, path: e.path),
              ),
    );
  }

  Widget _suggestions(BuildContext context) {
    final results =
        ref.watch(projectSearchProvider(widget.projectId, _mention!.query));
    return results.maybeWhen(
      data: (matches) {
        if (matches.isEmpty) return const SizedBox.shrink();
        return Container(
          constraints: const BoxConstraints(maxHeight: 180),
          decoration: BoxDecoration(
            color: context.colors.surface,
            border: Border(top: BorderSide(color: context.colors.border)),
          ),
          child: ListView.builder(
            shrinkWrap: true,
            itemCount: matches.length,
            itemBuilder: (_, i) {
              final p = matches[i];
              return ListTile(
                dense: true,
                leading: Icon(Icons.insert_drive_file_outlined,
                    size: 18, color: context.colors.muted),
                title: Text(p.split('/').last, style: context.text.regular14),
                subtitle: Text(
                  p,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: context.text.regular12
                      .copyWith(color: context.colors.muted),
                ),
                onTap: () => _selectSuggestion(p),
              );
            },
          ),
        );
      },
      orElse: () => const SizedBox.shrink(),
    );
  }

  Widget _composer(BuildContext context, bool busy) {
    return SafeArea(
      top: false,
      child: Container(
        decoration: BoxDecoration(
          color: context.colors.surface,
          border: Border(top: BorderSide(color: context.colors.border)),
        ),
        padding: const EdgeInsets.all(8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (_attachments.isNotEmpty)
              Align(
                alignment: Alignment.centerLeft,
                child: Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: _attachments
                      .map(
                        (p) => Chip(
                          label: Text(p.split('/').last,
                              style: context.text.regular12),
                          onDeleted: () => _toggleAttach(p),
                          visualDensity: VisualDensity.compact,
                        ),
                      )
                      .toList(),
                ),
              ),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: TextField(
                    controller: _prompt,
                    minLines: 1,
                    maxLines: 5,
                    decoration: const InputDecoration(
                      hintText: 'Ask Claude… (type @ to attach a file)',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                busy
                    ? const Padding(
                        padding: EdgeInsets.all(10),
                        child: SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                      )
                    : IconButton.filled(
                        icon: const Icon(Icons.arrow_upward),
                        onPressed: _send,
                      ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
