/// One entry in a project directory listing (GET /projects/:id/tree).
class TreeEntry {
  const TreeEntry(
      {required this.name, required this.path, required this.isDir});

  final String name;
  final String path;
  final bool isDir;

  factory TreeEntry.fromJson(Map<String, dynamic> json) => TreeEntry(
        name: json['name'] as String,
        path: json['path'] as String,
        isDir: (json['type'] as String?) == 'dir',
      );
}
