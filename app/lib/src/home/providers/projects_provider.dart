import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../core/extension/future.dart';
import '../../../core/instances/api_client.dart';
import '../models/project_summary.dart';

part 'projects_provider.g.dart';

/// Loads the registered projects from the paired daemon (proves auth works).
@riverpod
Future<List<ProjectSummary>> projects(Ref ref) async {
  final dio = ref.watch(apiProvider);
  final res = await dio.get<dynamic>('/projects').guard();
  final list = (res.data['projects'] as List).cast<Map<String, dynamic>>();
  return list.map(ProjectSummary.fromJson).toList();
}
