import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../core/extension/future.dart';
import '../../../core/instances/api_client.dart';
import '../models/build_row.dart';

part 'build_actions.g.dart';

/// Suggested release notes for a task (GET /tasks/:id/release-notes, S3-03).
class ReleaseNotes {
  const ReleaseNotes({required this.notes, required this.source});

  final List<String> notes;

  /// 'session' = asked the task's Claude session; 'diff' = derived from changed files.
  final String source;

  String get text => notes.join('\n');
}

/// Build + distribution actions (S3-01/02/03/04): start, cancel, retry, upload, and the
/// release-notes suggestion. Stateless — each method hits one daemon endpoint.
@riverpod
class BuildActions extends _$BuildActions {
  @override
  void build() {}

  /// Queue a build (POST /projects/:id/builds). Returns the queued build row.
  Future<BuildRow> start(
    String projectId, {
    String? taskId,
    String? flavor,
    bool? runCodegen,
  }) async {
    final dio = ref.read(apiProvider);
    final res = await dio.post<dynamic>(
      '/projects/$projectId/builds',
      data: {
        if (taskId != null) 'taskId': taskId,
        if (flavor != null) 'flavor': flavor,
        if (runCodegen != null) 'runCodegen': runCodegen,
      },
    ).guard();
    return BuildRow.fromJson(res.data as Map<String, dynamic>);
  }

  Future<void> cancel(String buildId) async {
    final dio = ref.read(apiProvider);
    await dio.post<dynamic>('/builds/$buildId/cancel').guard();
  }

  /// Retry a finished build (POST /builds/:id/retry). Returns the new build row.
  Future<BuildRow> retry(String buildId) async {
    final dio = ref.read(apiProvider);
    final res = await dio.post<dynamic>('/builds/$buildId/retry').guard();
    return BuildRow.fromJson(res.data as Map<String, dynamic>);
  }

  /// Upload a succeeded build to Firebase App Distribution (POST /builds/:id/upload).
  Future<void> upload(
    String buildId, {
    required String releaseNotes,
    List<String>? groups,
  }) async {
    final dio = ref.read(apiProvider);
    await dio.post<dynamic>(
      '/builds/$buildId/upload',
      data: {
        if (releaseNotes.isNotEmpty) 'releaseNotes': releaseNotes,
        if (groups != null && groups.isNotEmpty) 'groups': groups,
      },
    ).guard();
  }

  /// Suggested tester-facing release notes for a task (S3-03).
  Future<ReleaseNotes> releaseNotes(String taskId) async {
    final dio = ref.read(apiProvider);
    final res = await dio.get<dynamic>('/tasks/$taskId/release-notes').guard();
    final data = res.data as Map<String, dynamic>;
    return ReleaseNotes(
      notes: ((data['notes'] ?? []) as List).map((e) => e.toString()).toList(),
      source: (data['source'] ?? 'diff') as String,
    );
  }

  /// The most recent build for a task, if any (GET /projects/:id/builds, newest first).
  Future<BuildRow?> latestForTask(String projectId, String taskId) async {
    final dio = ref.read(apiProvider);
    final res = await dio.get<dynamic>('/projects/$projectId/builds').guard();
    final builds = (res.data['builds'] as List).cast<Map<String, dynamic>>();
    for (final b in builds) {
      if (b['taskId'] == taskId) return BuildRow.fromJson(b);
    }
    return null;
  }
}
