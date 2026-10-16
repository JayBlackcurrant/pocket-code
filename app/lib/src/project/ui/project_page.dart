import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/extension/context.dart';
import '../../routes/app_router.dart';
import '../../tasks/models/task_detail.dart';
import '../../tasks/providers/new_task_controller.dart';
import '../mention.dart';
import '../models/tree_entry.dart';
import '../providers/project_providers.dart';

/// Model choices for the composer. null = let the daemon / Claude Code pick its default.
const Map<String, String?> _kModels = {
  'Default model': null,
  'Opus': 'opus',
  'Sonnet': 'sonnet',
  'Haiku': 'haiku',
};

/// Permission-mode choices (like Claude Code). Values map to the agent SDK modes.
const Map<String, String> _kModes = {
  'Auto-accept edits': 'acceptEdits',
  'Ask each tool': 'default',
  'Plan first': 'plan',
};

/// A project's recent tasks + file browser, with a composer to start a new task.
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
  int _tab = 0; // 0 = Tasks, 1 = Files
  String? _model; // null = default model
  String _mode = 'acceptEdits'; // permission mode for the new task
  String? _baseRef; // null = project base branch

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
    final started = await ref.read(newTaskControllerProvider.notifier).create(
          widget.projectId,
          prompt,
          title: msg,
          model: _model,
          baseRef: _baseRef,
          permissionMode: _mode,
        );
    if (!mounted || started == null) return;
    _prompt.clear();
    setState(() => _attachments.clear());
    ref.invalidate(
        projectTasksProvider(widget.projectId)); // show the new task on return
    await context.router.push(TaskRoute(taskId: started.taskId));
  }

  @override
  Widget build(BuildContext context) {
    final creating = ref.watch(newTaskControllerProvider).isLoading;
    ref.listen(newTaskControllerProvider, (_, next) {
      if (next.hasError && mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('${next.error}')));
      }
    });

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.projectName),
        actions: [
          IconButton(
            tooltip: 'Run base branch on phone',
            icon: const Icon(Icons.play_circle_outline),
            onPressed: () => context.router.push(RunRoute(projectId: widget.projectId)),
          ),
        ],
      ),
      body: Column(
        children: [
          _tabHeader(context),
          Expanded(
              child: _tab == 0 ? _tasksView(context) : _filesView(context)),
          if (_mention != null) _suggestions(context),
          _composer(context, creating),
        ],
      ),
    );
  }

  Widget _tabHeader(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
      child: SegmentedButton<int>(
        segments: const [
          ButtonSegment(
              value: 0,
              label: Text('Tasks'),
              icon: Icon(Icons.list_alt, size: 18)),
          ButtonSegment(
              value: 1,
              label: Text('Files'),
              icon: Icon(Icons.folder_outlined, size: 18)),
        ],
        selected: {_tab},
        onSelectionChanged: (s) => setState(() => _tab = s.first),
        showSelectedIcon: false,
      ),
    );
  }

  Widget _tasksView(BuildContext context) {
    final tasks = ref.watch(projectTasksProvider(widget.projectId));
    return RefreshIndicator(
      onRefresh: () async =>
          ref.invalidate(projectTasksProvider(widget.projectId)),
      child: tasks.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ListView(children: [
          Padding(
              padding: const EdgeInsets.all(24),
              child: Text('$e', style: context.text.regular14)),
        ]),
        data: (list) {
          if (list.isEmpty) {
            return ListView(children: [
              Padding(
                padding: const EdgeInsets.all(24),
                child: Text('No tasks yet — start one below.',
                    style: context.text.regular14
                        .copyWith(color: context.colors.muted)),
              ),
            ]);
          }
          return ListView.separated(
            itemCount: list.length,
            separatorBuilder: (_, __) => const Divider(height: 1),
            itemBuilder: (_, i) => _taskTile(context, list[i]),
          );
        },
      ),
    );
  }

  Widget _taskTile(BuildContext context, TaskDetail t) {
    final color = switch (t.status) {
      'done' => context.colors.green,
      'failed' || 'cancelled' || 'discarded' => context.colors.red,
      'running' || 'queued' || 'waiting' => context.colors.primary,
      _ => context.colors.muted,
    };
    final branch =
        t.branch.isEmpty ? t.id : t.branch.replaceFirst('claude/', '');
    return ListTile(
      dense: true,
      leading: Icon(Icons.commit, size: 20, color: color),
      title: Text(branch,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: context.text.regular14),
      // Cost is tracked server-side but intentionally not shown in the app.
      subtitle: Text(
        t.status,
        style: context.text.regular12.copyWith(color: context.colors.muted),
      ),
      trailing: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Text(t.status,
            style: context.text.regular12.copyWith(color: color)),
      ),
      onTap: () => context.router.push(TaskRoute(taskId: t.id)),
    );
  }

  Widget _filesView(BuildContext context) {
    final tree = ref.watch(projectTreeProvider(widget.projectId, _dir));
    return Column(
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
      ],
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

  // Model · permission mode · base branch pickers (like Claude Code).
  Widget _optionsRow(BuildContext context, bool busy) {
    final branches = ref.watch(projectBranchesProvider(widget.projectId));
    return Align(
      alignment: Alignment.centerLeft,
      child: Wrap(
        spacing: 14,
        runSpacing: 2,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          _iconDropdown<String?>(
            context,
            Icons.memory,
            _model,
            [
              for (final e in _kModels.entries)
                DropdownMenuItem(value: e.value, child: Text(e.key))
            ],
            busy ? null : (v) => setState(() => _model = v),
          ),
          _iconDropdown<String>(
            context,
            Icons.tune,
            _mode,
            [
              for (final e in _kModes.entries)
                DropdownMenuItem(value: e.value, child: Text(e.key))
            ],
            busy ? null : (v) => setState(() => _mode = v!),
          ),
          branches.maybeWhen(
            data: (b) => _iconDropdown<String?>(
              context,
              Icons.call_split,
              _baseRef,
              [
                DropdownMenuItem(value: null, child: Text('base: ${b.base}')),
                for (final name in b.branches.where((n) => n != b.base))
                  DropdownMenuItem(value: name, child: Text(name)),
              ],
              busy ? null : (v) => setState(() => _baseRef = v),
            ),
            orElse: () => const SizedBox.shrink(),
          ),
        ],
      ),
    );
  }

  Widget _iconDropdown<T>(
    BuildContext context,
    IconData icon,
    T value,
    List<DropdownMenuItem<T>> items,
    void Function(T?)? onChanged,
  ) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 16, color: context.colors.muted),
        const SizedBox(width: 4),
        DropdownButton<T>(
          value: value,
          isDense: true,
          underline: const SizedBox.shrink(),
          style: context.text.regular12,
          items: items,
          onChanged: onChanged,
        ),
      ],
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
            _optionsRow(context, busy),
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
