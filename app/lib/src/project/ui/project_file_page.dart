import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/extension/context.dart';
import '../../review/ui/code_view.dart';
import '../providers/project_providers.dart';

/// View a project file (read-only) in the browser.
@RoutePage()
class ProjectFilePage extends ConsumerWidget {
  const ProjectFilePage(
      {required this.projectId, required this.path, super.key});

  final String projectId;
  final String path;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final file = ref.watch(projectFileProvider(projectId, path));
    return Scaffold(
      appBar: AppBar(title: Text(path.split('/').last)),
      body: file.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Padding(
          padding: const EdgeInsets.all(24),
          child: Text('$e', style: context.text.regular14),
        ),
        data: (f) => CodeView(
          path: path,
          content: f.content,
          binary: f.binary,
          truncated: f.truncated,
        ),
      ),
    );
  }
}
