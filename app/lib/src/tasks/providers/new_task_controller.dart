import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../core/extension/future.dart';
import '../../../core/instances/api_client.dart';
import '../models/started_task.dart';

part 'new_task_controller.g.dart';

/// Creates and starts a task on a project (POST /projects/:id/tasks).
@riverpod
class NewTaskController extends _$NewTaskController {
  @override
  FutureOr<StartedTask?> build() => null;

  Future<StartedTask?> create(String projectId, String prompt, {String? title}) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      final dio = ref.read(apiProvider);
      final res = await dio.post<dynamic>(
        '/projects/$projectId/tasks',
        data: {
          'prompt': prompt,
          // Name the branch from the user's message, not the folded "consider these files" prompt.
          if (title != null && title.isNotEmpty) 'title': title,
        },
      ).guard();
      return StartedTask.fromJson(res.data as Map<String, dynamic>);
    });
    return state.value;
  }
}
