import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../core/extension/future.dart';
import '../../../core/instances/api_client.dart';
import '../models/task_detail.dart';

part 'task_provider.g.dart';

/// Fetches a task's current state (GET /tasks/:id). The live event stream is S1-10.
@riverpod
Future<TaskDetail> taskDetail(Ref ref, String taskId) async {
  final dio = ref.watch(apiProvider);
  final res = await dio.get<dynamic>('/tasks/$taskId').guard();
  return TaskDetail.fromJson(res.data as Map<String, dynamic>);
}
