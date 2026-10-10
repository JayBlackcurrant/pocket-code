// dart format width=80
// GENERATED CODE - DO NOT MODIFY BY HAND

// **************************************************************************
// AutoRouterGenerator
// **************************************************************************

// ignore_for_file: type=lint
// coverage:ignore-file

part of 'app_router.dart';

/// generated route for
/// [BuildsPage]
class BuildsRoute extends PageRouteInfo<BuildsRouteArgs> {
  BuildsRoute({required String taskId, Key? key, List<PageRouteInfo>? children})
      : super(
          BuildsRoute.name,
          args: BuildsRouteArgs(taskId: taskId, key: key),
          initialChildren: children,
        );

  static const String name = 'BuildsRoute';

  static PageInfo page = PageInfo(
    name,
    builder: (data) {
      final args = data.argsAs<BuildsRouteArgs>();
      return BuildsPage(taskId: args.taskId, key: args.key);
    },
  );
}

class BuildsRouteArgs {
  const BuildsRouteArgs({required this.taskId, this.key});

  final String taskId;

  final Key? key;

  @override
  String toString() {
    return 'BuildsRouteArgs{taskId: $taskId, key: $key}';
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! BuildsRouteArgs) return false;
    return taskId == other.taskId && key == other.key;
  }

  @override
  int get hashCode => taskId.hashCode ^ key.hashCode;
}

/// generated route for
/// [CodeViewerPage]
class CodeViewerRoute extends PageRouteInfo<CodeViewerRouteArgs> {
  CodeViewerRoute({
    required String taskId,
    required String path,
    Key? key,
    List<PageRouteInfo>? children,
  }) : super(
          CodeViewerRoute.name,
          args: CodeViewerRouteArgs(taskId: taskId, path: path, key: key),
          initialChildren: children,
        );

  static const String name = 'CodeViewerRoute';

  static PageInfo page = PageInfo(
    name,
    builder: (data) {
      final args = data.argsAs<CodeViewerRouteArgs>();
      return CodeViewerPage(
        taskId: args.taskId,
        path: args.path,
        key: args.key,
      );
    },
  );
}

class CodeViewerRouteArgs {
  const CodeViewerRouteArgs({
    required this.taskId,
    required this.path,
    this.key,
  });

  final String taskId;

  final String path;

  final Key? key;

  @override
  String toString() {
    return 'CodeViewerRouteArgs{taskId: $taskId, path: $path, key: $key}';
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! CodeViewerRouteArgs) return false;
    return taskId == other.taskId && path == other.path && key == other.key;
  }

  @override
  int get hashCode => taskId.hashCode ^ path.hashCode ^ key.hashCode;
}

/// generated route for
/// [DiffFilePage]
class DiffFileRoute extends PageRouteInfo<DiffFileRouteArgs> {
  DiffFileRoute({
    required String taskId,
    required String path,
    Key? key,
    List<PageRouteInfo>? children,
  }) : super(
          DiffFileRoute.name,
          args: DiffFileRouteArgs(taskId: taskId, path: path, key: key),
          initialChildren: children,
        );

  static const String name = 'DiffFileRoute';

  static PageInfo page = PageInfo(
    name,
    builder: (data) {
      final args = data.argsAs<DiffFileRouteArgs>();
      return DiffFilePage(taskId: args.taskId, path: args.path, key: args.key);
    },
  );
}

class DiffFileRouteArgs {
  const DiffFileRouteArgs({required this.taskId, required this.path, this.key});

  final String taskId;

  final String path;

  final Key? key;

  @override
  String toString() {
    return 'DiffFileRouteArgs{taskId: $taskId, path: $path, key: $key}';
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! DiffFileRouteArgs) return false;
    return taskId == other.taskId && path == other.path && key == other.key;
  }

  @override
  int get hashCode => taskId.hashCode ^ path.hashCode ^ key.hashCode;
}

/// generated route for
/// [HomePage]
class HomeRoute extends PageRouteInfo<void> {
  const HomeRoute({List<PageRouteInfo>? children})
      : super(HomeRoute.name, initialChildren: children);

  static const String name = 'HomeRoute';

  static PageInfo page = PageInfo(
    name,
    builder: (data) {
      return const HomePage();
    },
  );
}

/// generated route for
/// [NotificationsPage]
class NotificationsRoute extends PageRouteInfo<void> {
  const NotificationsRoute({List<PageRouteInfo>? children})
      : super(NotificationsRoute.name, initialChildren: children);

  static const String name = 'NotificationsRoute';

  static PageInfo page = PageInfo(
    name,
    builder: (data) {
      return const NotificationsPage();
    },
  );
}

/// generated route for
/// [PairingPage]
class PairingRoute extends PageRouteInfo<void> {
  const PairingRoute({List<PageRouteInfo>? children})
      : super(PairingRoute.name, initialChildren: children);

  static const String name = 'PairingRoute';

  static PageInfo page = PageInfo(
    name,
    builder: (data) {
      return const PairingPage();
    },
  );
}

/// generated route for
/// [ProjectFilePage]
class ProjectFileRoute extends PageRouteInfo<ProjectFileRouteArgs> {
  ProjectFileRoute({
    required String projectId,
    required String path,
    Key? key,
    List<PageRouteInfo>? children,
  }) : super(
          ProjectFileRoute.name,
          args:
              ProjectFileRouteArgs(projectId: projectId, path: path, key: key),
          initialChildren: children,
        );

  static const String name = 'ProjectFileRoute';

  static PageInfo page = PageInfo(
    name,
    builder: (data) {
      final args = data.argsAs<ProjectFileRouteArgs>();
      return ProjectFilePage(
        projectId: args.projectId,
        path: args.path,
        key: args.key,
      );
    },
  );
}

class ProjectFileRouteArgs {
  const ProjectFileRouteArgs({
    required this.projectId,
    required this.path,
    this.key,
  });

  final String projectId;

  final String path;

  final Key? key;

  @override
  String toString() {
    return 'ProjectFileRouteArgs{projectId: $projectId, path: $path, key: $key}';
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! ProjectFileRouteArgs) return false;
    return projectId == other.projectId &&
        path == other.path &&
        key == other.key;
  }

  @override
  int get hashCode => projectId.hashCode ^ path.hashCode ^ key.hashCode;
}

/// generated route for
/// [ProjectPage]
class ProjectRoute extends PageRouteInfo<ProjectRouteArgs> {
  ProjectRoute({
    required String projectId,
    required String projectName,
    Key? key,
    List<PageRouteInfo>? children,
  }) : super(
          ProjectRoute.name,
          args: ProjectRouteArgs(
            projectId: projectId,
            projectName: projectName,
            key: key,
          ),
          initialChildren: children,
        );

  static const String name = 'ProjectRoute';

  static PageInfo page = PageInfo(
    name,
    builder: (data) {
      final args = data.argsAs<ProjectRouteArgs>();
      return ProjectPage(
        projectId: args.projectId,
        projectName: args.projectName,
        key: args.key,
      );
    },
  );
}

class ProjectRouteArgs {
  const ProjectRouteArgs({
    required this.projectId,
    required this.projectName,
    this.key,
  });

  final String projectId;

  final String projectName;

  final Key? key;

  @override
  String toString() {
    return 'ProjectRouteArgs{projectId: $projectId, projectName: $projectName, key: $key}';
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! ProjectRouteArgs) return false;
    return projectId == other.projectId &&
        projectName == other.projectName &&
        key == other.key;
  }

  @override
  int get hashCode => projectId.hashCode ^ projectName.hashCode ^ key.hashCode;
}

/// generated route for
/// [ReviewPage]
class ReviewRoute extends PageRouteInfo<ReviewRouteArgs> {
  ReviewRoute({required String taskId, Key? key, List<PageRouteInfo>? children})
      : super(
          ReviewRoute.name,
          args: ReviewRouteArgs(taskId: taskId, key: key),
          initialChildren: children,
        );

  static const String name = 'ReviewRoute';

  static PageInfo page = PageInfo(
    name,
    builder: (data) {
      final args = data.argsAs<ReviewRouteArgs>();
      return ReviewPage(taskId: args.taskId, key: args.key);
    },
  );
}

class ReviewRouteArgs {
  const ReviewRouteArgs({required this.taskId, this.key});

  final String taskId;

  final Key? key;

  @override
  String toString() {
    return 'ReviewRouteArgs{taskId: $taskId, key: $key}';
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! ReviewRouteArgs) return false;
    return taskId == other.taskId && key == other.key;
  }

  @override
  int get hashCode => taskId.hashCode ^ key.hashCode;
}

/// generated route for
/// [TaskPage]
class TaskRoute extends PageRouteInfo<TaskRouteArgs> {
  TaskRoute({required String taskId, Key? key, List<PageRouteInfo>? children})
      : super(
          TaskRoute.name,
          args: TaskRouteArgs(taskId: taskId, key: key),
          initialChildren: children,
        );

  static const String name = 'TaskRoute';

  static PageInfo page = PageInfo(
    name,
    builder: (data) {
      final args = data.argsAs<TaskRouteArgs>();
      return TaskPage(taskId: args.taskId, key: args.key);
    },
  );
}

class TaskRouteArgs {
  const TaskRouteArgs({required this.taskId, this.key});

  final String taskId;

  final Key? key;

  @override
  String toString() {
    return 'TaskRouteArgs{taskId: $taskId, key: $key}';
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! TaskRouteArgs) return false;
    return taskId == other.taskId && key == other.key;
  }

  @override
  int get hashCode => taskId.hashCode ^ key.hashCode;
}
