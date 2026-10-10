import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../core/extension/future.dart';
import '../../../core/instances/api_client.dart';
import '../../review/models/file_content.dart';
import '../models/tree_entry.dart';

part 'project_providers.g.dart';

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

/// Read a project file (GET /projects/:id/files?path=).
@riverpod
Future<FileContent> projectFile(Ref ref, String projectId, String path) async {
  final dio = ref.watch(apiProvider);
  final res = await dio.get<dynamic>('/projects/$projectId/files',
      queryParameters: {'path': path}).guard();
  return FileContent.fromJson(res.data as Map<String, dynamic>);
}
