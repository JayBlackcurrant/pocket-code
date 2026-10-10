/// A notification as delivered by the daemon (GET /notifications, WS /notifications/stream).
class AppNotification {
  const AppNotification({
    required this.seq,
    required this.kind,
    required this.title,
    required this.body,
    required this.createdAt,
    required this.read,
    this.taskId,
    this.buildId,
  });

  final int seq;

  /// approval | taskDone | taskFailed | buildReady | buildFailed | shipped | uploadFailed
  final String kind;
  final String title;
  final String body;
  final int createdAt;
  final bool read;
  final String? taskId;
  final String? buildId;

  AppNotification copyWith({bool? read}) => AppNotification(
        seq: seq,
        kind: kind,
        title: title,
        body: body,
        createdAt: createdAt,
        read: read ?? this.read,
        taskId: taskId,
        buildId: buildId,
      );

  factory AppNotification.fromJson(Map<String, dynamic> json) =>
      AppNotification(
        seq: json['seq'] as int,
        kind: (json['kind'] ?? '') as String,
        title: (json['title'] ?? '') as String,
        body: (json['body'] ?? '') as String,
        createdAt: (json['createdAt'] ?? 0) as int,
        read: (json['read'] ?? false) as bool,
        taskId: json['taskId'] as String?,
        buildId: json['buildId'] as String?,
      );
}
