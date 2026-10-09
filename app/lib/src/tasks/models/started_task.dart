/// Result of POST /projects/:id/tasks.
class StartedTask {
  const StartedTask({
    required this.taskId,
    required this.branch,
    required this.worktree,
  });

  final String taskId;
  final String branch;
  final String worktree;

  factory StartedTask.fromJson(Map<String, dynamic> json) => StartedTask(
        taskId: json['taskId'] as String,
        branch: (json['branch'] ?? '') as String,
        worktree: (json['worktree'] ?? '') as String,
      );
}
