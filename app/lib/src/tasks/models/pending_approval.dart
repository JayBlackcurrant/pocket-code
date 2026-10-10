/// A tool call the daemon has parked, waiting for the phone to allow or deny (S2-01/04).
class PendingApproval {
  const PendingApproval({
    required this.toolUseId,
    required this.toolName,
    required this.input,
  });

  final String toolUseId;
  final String toolName;
  final Map<String, dynamic> input;

  /// A short, human-readable summary of what the tool wants to do.
  String get summary {
    final command = input['command'];
    if (command is String && command.isNotEmpty) return command;
    final path = input['file_path'] ?? input['path'] ?? input['url'];
    if (path is String && path.isNotEmpty) return path;
    return input.isEmpty ? '' : input.toString();
  }
}
