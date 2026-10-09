/// A project as returned by the daemon's GET /projects (hand-written model; the
/// daemon has no OpenAPI package, unlike hedged's generated `api`).
class ProjectSummary {
  const ProjectSummary({
    required this.id,
    required this.displayName,
    required this.status,
    required this.base,
  });

  final String id;
  final String displayName;
  final String status;
  final String base;

  factory ProjectSummary.fromJson(Map<String, dynamic> json) => ProjectSummary(
        id: json['id'] as String,
        displayName: (json['displayName'] ?? json['id']) as String,
        status: (json['status'] ?? 'unknown') as String,
        base: (json['base'] ?? '') as String,
      );
}
