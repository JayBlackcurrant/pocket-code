import '../build_feed.dart';

/// UI state for a live build log stream (S3-06).
class BuildStreamState {
  const BuildStreamState({
    required this.lines,
    required this.status,
    required this.connected,
    required this.caughtUp,
    this.uploadStatus,
    this.releaseUrl,
    this.error,
  });

  final List<BuildLine> lines;

  /// connecting | queued | running | succeeded | failed | cancelled
  final String status;

  /// null | uploading | uploaded | failed
  final String? uploadStatus;
  final String? releaseUrl;
  final bool connected;
  final bool caughtUp;
  final String? error;

  factory BuildStreamState.initial() => const BuildStreamState(
        lines: [],
        status: 'connecting',
        connected: false,
        caughtUp: false,
      );

  bool get isBuilding => status == 'running' || status == 'queued';
  bool get succeeded => status == 'succeeded';
  bool get failed => status == 'failed';
  bool get cancelled => status == 'cancelled';
  bool get isUploading => uploadStatus == 'uploading';
  bool get uploaded => uploadStatus == 'uploaded';

  BuildStreamState copyWith({
    List<BuildLine>? lines,
    String? status,
    String? uploadStatus,
    String? releaseUrl,
    bool? connected,
    bool? caughtUp,
    String? error,
    bool clearError = false,
  }) {
    return BuildStreamState(
      lines: lines ?? this.lines,
      status: status ?? this.status,
      uploadStatus: uploadStatus ?? this.uploadStatus,
      releaseUrl: releaseUrl ?? this.releaseUrl,
      connected: connected ?? this.connected,
      caughtUp: caughtUp ?? this.caughtUp,
      error: clearError ? null : (error ?? this.error),
    );
  }
}
