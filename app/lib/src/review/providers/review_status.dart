import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../core/extension/future.dart';
import '../../../core/instances/api_client.dart';

part 'review_status.g.dart';

/// Review/commit state of a task's branch (GET /tasks/:id/review-status). Drives the
/// review → commit → build flow: a build is only offered once changes are committed.
class ReviewStatus {
  const ReviewStatus({
    required this.clean,
    required this.committedAhead,
    required this.buildReady,
  });

  /// No uncommitted changes in the checkout.
  final bool clean;

  /// Commits on the task branch past the base (reviewable, committed work).
  final int committedAhead;

  /// clean && committedAhead > 0 — safe and meaningful to build.
  final bool buildReady;

  bool get hasUncommitted => !clean;

  factory ReviewStatus.fromJson(Map<String, dynamic> json) => ReviewStatus(
        clean: (json['clean'] ?? true) as bool,
        committedAhead: (json['committedAhead'] ?? 0) as int,
        buildReady: (json['buildReady'] ?? false) as bool,
      );
}

@riverpod
Future<ReviewStatus> taskReviewStatus(Ref ref, String taskId) async {
  final dio = ref.watch(apiProvider);
  final res = await dio.get<dynamic>('/tasks/$taskId/review-status').guard();
  return ReviewStatus.fromJson(res.data as Map<String, dynamic>);
}
