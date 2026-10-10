/// A build as returned by the daemon (POST/GET /projects/:id/builds, GET /builds/:id).
class BuildRow {
  const BuildRow({
    required this.id,
    required this.projectId,
    required this.status,
    this.taskId,
    this.flavor,
    this.artifact,
    this.error,
    this.uploadStatus,
    this.releaseUrl,
    this.uploadError,
    this.retryOf,
  });

  final String id;
  final String projectId;

  /// queued | running | succeeded | failed | cancelled
  final String status;
  final String? taskId;
  final String? flavor;
  final String? artifact;
  final String? error;

  /// null | uploading | uploaded | failed
  final String? uploadStatus;
  final String? releaseUrl;
  final String? uploadError;
  final String? retryOf;

  bool get succeeded => status == 'succeeded';
  bool get failed => status == 'failed';
  bool get finished =>
      status == 'succeeded' || status == 'failed' || status == 'cancelled';

  factory BuildRow.fromJson(Map<String, dynamic> json) => BuildRow(
        id: json['id'] as String,
        projectId: (json['projectId'] ?? '') as String,
        status: (json['status'] ?? 'unknown') as String,
        taskId: json['taskId'] as String?,
        flavor: json['flavor'] as String?,
        artifact: json['artifact'] as String?,
        error: json['error'] as String?,
        uploadStatus: json['uploadStatus'] as String?,
        releaseUrl: json['releaseUrl'] as String?,
        uploadError: json['uploadError'] as String?,
        retryOf: json['retryOf'] as String?,
      );
}
