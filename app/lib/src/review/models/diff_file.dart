/// One changed file from GET /tasks/:id/diff/summary.
class DiffFileSummary {
  const DiffFileSummary({
    required this.path,
    required this.oldPath,
    required this.status,
    required this.additions,
    required this.deletions,
    required this.binary,
  });

  final String path;
  final String? oldPath;
  final String status; // added|modified|deleted|renamed|copied|untracked
  final int additions;
  final int deletions;
  final bool binary;

  factory DiffFileSummary.fromJson(Map<String, dynamic> json) =>
      DiffFileSummary(
        path: json['path'] as String,
        oldPath: json['oldPath'] as String?,
        status: (json['status'] ?? 'modified') as String,
        additions: (json['additions'] as num?)?.toInt() ?? 0,
        deletions: (json['deletions'] as num?)?.toInt() ?? 0,
        binary: (json['binary'] as bool?) ?? false,
      );

  /// Generated files are collapsed by default in review (CLAUDE.md).
  bool get isGenerated {
    final name = path.split('/').last;
    return path.endsWith('.g.dart') ||
        path.endsWith('.gr.dart') ||
        path.endsWith('.freezed.dart') ||
        name == 'pubspec.lock';
  }
}

/// One file's patch from GET /tasks/:id/diff?path=.
class FileDiff {
  const FileDiff({
    required this.path,
    required this.binary,
    required this.truncated,
    required this.patch,
  });

  final String path;
  final bool binary;
  final bool truncated;
  final String? patch; // null when binary

  factory FileDiff.fromJson(Map<String, dynamic> json) => FileDiff(
        path: json['path'] as String,
        binary: (json['binary'] as bool?) ?? false,
        truncated: (json['truncated'] as bool?) ?? false,
        patch: json['patch'] as String?,
      );
}
