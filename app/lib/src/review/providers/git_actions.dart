import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../core/extension/future.dart';
import '../../../core/instances/api_client.dart';

part 'git_actions.g.dart';

/// Git actions for a task (S2-09): commit, revert, push, discard.
///
/// keepAlive so the notifier's `ref` stays valid across async gaps (e.g. while a commit
/// dialog is open). As an autoDispose provider it was torn down between a `.read().notifier`
/// and a later method call — then `ref.read(apiProvider)` hit a disposed ref.
@Riverpod(keepAlive: true)
class GitActions extends _$GitActions {
  late String _taskId;

  @override
  void build(String taskId) {
    _taskId = taskId;
  }

  Future<String> suggestMessage() async {
    final dio = ref.read(apiProvider);
    final res =
        await dio.get<dynamic>('/tasks/$_taskId/commit-message').guard();
    return (res.data['message'] ?? '') as String;
  }

  /// Commit all changes; returns the new short sha.
  Future<String> commit(String? message) async {
    final dio = ref.read(apiProvider);
    final res = await dio.post<dynamic>(
      '/tasks/$_taskId/commit',
      data: {if (message != null && message.isNotEmpty) 'message': message},
    ).guard();
    return (res.data['sha'] ?? '') as String;
  }

  Future<void> revert(String path) async {
    final dio = ref.read(apiProvider);
    await dio
        .post<dynamic>('/tasks/$_taskId/revert', data: {'path': path}).guard();
  }

  /// Push the task's claude/* branch; returns the branch name.
  Future<String> push() async {
    final dio = ref.read(apiProvider);
    final res = await dio.post<dynamic>('/tasks/$_taskId/push').guard();
    return (res.data['branch'] ?? '') as String;
  }

  Future<void> discard() async {
    final dio = ref.read(apiProvider);
    await dio.post<dynamic>('/tasks/$_taskId/discard').guard();
  }
}
