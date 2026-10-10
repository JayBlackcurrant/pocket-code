import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../core/extension/future.dart';
import '../../../core/instances/api_client.dart';
import '../models/diff_file.dart';

part 'diff_providers.g.dart';

/// Changed files for a task (GET /tasks/:id/diff/summary).
@riverpod
Future<List<DiffFileSummary>> diffSummary(Ref ref, String taskId) async {
  final dio = ref.watch(apiProvider);
  final res = await dio.get<dynamic>('/tasks/$taskId/diff/summary').guard();
  final files = (res.data['files'] as List).cast<Map<String, dynamic>>();
  return files.map(DiffFileSummary.fromJson).toList();
}

/// One file's unified patch (GET /tasks/:id/diff?path=).
@riverpod
Future<FileDiff> fileDiff(Ref ref, String taskId, String path) async {
  final dio = ref.watch(apiProvider);
  final res = await dio.get<dynamic>('/tasks/$taskId/diff',
      queryParameters: {'path': path}).guard();
  return FileDiff.fromJson(res.data as Map<String, dynamic>);
}
