import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../core/extension/future.dart';
import '../../../core/instances/api_client.dart';
import '../../review/models/file_content.dart';
import '../../tasks/models/task_detail.dart';
import '../models/tree_entry.dart';

part 'project_providers.g.dart';

/// Recent tasks for a project (GET /projects/:id/tasks), newest-first.
@riverpod
Future<List<TaskDetail>> projectTasks(Ref ref, String projectId) async {
  final dio = ref.watch(apiProvider);
  final res = await dio.get<dynamic>('/projects/$projectId/tasks').guard();
  return (res.data['tasks'] as List)
      .cast<Map<String, dynamic>>()
      .map(TaskDetail.fromJson)
      .toList();
}

/// List one directory of a project (GET /projects/:id/tree?path=).
@riverpod
Future<List<TreeEntry>> projectTree(
    Ref ref, String projectId, String path) async {
  final dio = ref.watch(apiProvider);
  final res = await dio
      .get<dynamic>(
        '/projects/$projectId/tree',
        queryParameters: path.isEmpty ? null : {'path': path},
      )
      .guard();
  return (res.data['entries'] as List)
      .cast<Map<String, dynamic>>()
      .map(TreeEntry.fromJson)
      .toList();
}

/// Search project files for @-mention autocomplete (GET /projects/:id/search?q=).
@riverpod
Future<List<String>> projectSearch(
    Ref ref, String projectId, String query) async {
  final dio = ref.watch(apiProvider);
  final res = await dio.get<dynamic>('/projects/$projectId/search',
      queryParameters: {'q': query}).guard();
  return (res.data['matches'] as List).cast<String>();
}

/// Read a project file (GET /projects/:id/files?path=).
@riverpod
Future<FileContent> projectFile(Ref ref, String projectId, String path) async {
  final dio = ref.watch(apiProvider);
  final res = await dio.get<dynamic>('/projects/$projectId/files',
      queryParameters: {'path': path}).guard();
  return FileContent.fromJson(res.data as Map<String, dynamic>);
}
