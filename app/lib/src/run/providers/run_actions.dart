import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../core/extension/future.dart';
import '../../../core/instances/api_client.dart';
import '../models/device.dart';
import '../models/run_row.dart';

part 'run_actions.g.dart';

/// Outcome of a hot reload / restart (POST /runs/:id/{reload,restart}, S5-05).
class RunControlResult {
  const RunControlResult({required this.ok, this.code, this.message});

  final bool ok;
  final int? code;
  final String? message;

  factory RunControlResult.fromJson(Map<String, dynamic> json) => RunControlResult(
        ok: (json['ok'] ?? false) as bool,
        code: json['code'] as int?,
        message: json['message'] as String?,
      );
}

/// Live-run actions (S5-05/06): device discovery, start, hot reload/restart, stop. Stateless —
/// each method hits one daemon endpoint.
@riverpod
class RunActions extends _$RunActions {
  @override
  void build() {}

  /// Discover the run target via the adb connect cascade (GET /projects/:id/devices?host=).
  /// `host` is the phone's own tailnet IP.
  Future<DeviceDiscovery> devices(String projectId, String host) async {
    final dio = ref.read(apiProvider);
    final res = await dio.get<dynamic>(
      '/projects/$projectId/devices',
      queryParameters: {'host': host},
    ).guard();
    return DeviceDiscovery.fromJson(res.data as Map<String, dynamic>);
  }

  /// Start a run session (POST /projects/:id/runs). Returns the created run row.
  Future<RunRow> start(
    String projectId, {
    required String deviceSerial,
    String? taskId,
    String? flavor,
  }) async {
    final dio = ref.read(apiProvider);
    final res = await dio.post<dynamic>(
      '/projects/$projectId/runs',
      data: {
        'deviceSerial': deviceSerial,
        if (taskId != null) 'taskId': taskId,
        if (flavor != null) 'flavor': flavor,
      },
    ).guard();
    return RunRow.fromJson(res.data as Map<String, dynamic>);
  }

  Future<RunControlResult> reload(String runId) => _control(runId, 'reload');
  Future<RunControlResult> restart(String runId) => _control(runId, 'restart');

  Future<RunControlResult> _control(String runId, String kind) async {
    final dio = ref.read(apiProvider);
    final res = await dio.post<dynamic>('/runs/$runId/$kind').guard();
    return RunControlResult.fromJson(res.data as Map<String, dynamic>);
  }

  Future<void> stop(String runId) async {
    final dio = ref.read(apiProvider);
    await dio.post<dynamic>('/runs/$runId/stop').guard();
  }

  /// Save an edited file to the task's checkout (POST /tasks/:id/file, S5-12). Path-safe on the
  /// daemon; if a live run is on the task's branch it hot-reloads. Returns whether a reload fired.
  Future<bool> writeFile(String taskId, String path, String content) async {
    final dio = ref.read(apiProvider);
    final res = await dio.post<dynamic>(
      '/tasks/$taskId/file',
      data: {'path': path, 'content': content},
    ).guard();
    final data = res.data as Map<String, dynamic>;
    return (data['reloadTriggered'] ?? false) as bool;
  }

  /// The most recent still-active run for a task (or the base run when `taskId` is null), if any
  /// (GET /projects/:id/runs, newest first).
  Future<RunRow?> activeRun(String projectId, {String? taskId}) async {
    final dio = ref.read(apiProvider);
    final res = await dio.get<dynamic>('/projects/$projectId/runs').guard();
    final runs = (res.data['runs'] as List).cast<Map<String, dynamic>>();
    for (final r in runs) {
      final row = RunRow.fromJson(r);
      if (row.taskId == taskId && row.active) return row;
    }
    return null;
  }
}
