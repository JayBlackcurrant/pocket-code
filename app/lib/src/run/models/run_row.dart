/// A run session as returned by the daemon (POST/GET /projects/:id/runs, GET /runs/:id).
class RunRow {
  const RunRow({
    required this.id,
    required this.projectId,
    required this.status,
    required this.branch,
    this.taskId,
    this.deviceSerial,
    this.debugPort,
    this.error,
  });

  final String id;
  final String projectId;

  /// starting | running | reloading | stopped | failed
  final String status;
  final String branch;
  final String? taskId;
  final String? deviceSerial;
  final String? debugPort;
  final String? error;

  bool get running => status == 'running';
  bool get reloading => status == 'reloading';
  bool get active => status == 'starting' || status == 'running' || status == 'reloading';
  bool get finished => status == 'stopped' || status == 'failed';

  factory RunRow.fromJson(Map<String, dynamic> json) => RunRow(
        id: json['id'] as String,
        projectId: (json['projectId'] ?? '') as String,
        status: (json['status'] ?? 'unknown') as String,
        branch: (json['branch'] ?? '') as String,
        taskId: json['taskId'] as String?,
        deviceSerial: json['deviceSerial'] as String?,
        debugPort: json['debugPort'] as String?,
        error: json['error'] as String?,
      );
}
