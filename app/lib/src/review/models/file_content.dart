/// File contents from GET /tasks/:id/files?path= (S2-06).
class FileContent {
  const FileContent({
    required this.path,
    required this.size,
    required this.binary,
    required this.truncated,
    required this.content,
  });

  final String path;
  final int size;
  final bool binary;
  final bool truncated;
  final String? content; // null when binary

  factory FileContent.fromJson(Map<String, dynamic> json) => FileContent(
        path: json['path'] as String,
        size: (json['size'] as num?)?.toInt() ?? 0,
        binary: (json['binary'] as bool?) ?? false,
        truncated: (json['truncated'] as bool?) ?? false,
        content: json['content'] as String?,
      );
}
