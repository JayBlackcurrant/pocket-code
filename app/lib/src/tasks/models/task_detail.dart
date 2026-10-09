/// A task row as returned by GET /tasks/:id.
class TaskDetail {
  const TaskDetail({
    required this.id,
    required this.projectId,
    required this.branch,
    required this.worktree,
    required this.status,
    required this.sessionId,
    required this.costUsd,
  });

  final String id;
  final String projectId;
  final String branch;
  final String worktree;
  final String status;
  final String? sessionId;
  final double? costUsd;

  factory TaskDetail.fromJson(Map<String, dynamic> json) => TaskDetail(
        id: json['id'] as String,
        projectId: (json['projectId'] ?? '') as String,
        branch: (json['branch'] ?? '') as String,
        worktree: (json['worktree'] ?? '') as String,
        status: (json['status'] ?? 'unknown') as String,
        sessionId: json['sessionId'] as String?,
        costUsd: (json['costUsd'] as num?)?.toDouble(),
      );
}
