// dart format width=80
// GENERATED CODE - DO NOT MODIFY BY HAND

// **************************************************************************
// AutoRouterGenerator
// **************************************************************************

// ignore_for_file: type=lint
// coverage:ignore-file

part of 'app_router.dart';

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
/// [NewTaskPage]
class NewTaskRoute extends PageRouteInfo<NewTaskRouteArgs> {
  NewTaskRoute({
    required String projectId,
    required String projectName,
    Key? key,
    List<PageRouteInfo>? children,
  }) : super(
          NewTaskRoute.name,
          args: NewTaskRouteArgs(
            projectId: projectId,
            projectName: projectName,
            key: key,
          ),
          initialChildren: children,
        );

  static const String name = 'NewTaskRoute';

  static PageInfo page = PageInfo(
    name,
    builder: (data) {
      final args = data.argsAs<NewTaskRouteArgs>();
      return NewTaskPage(
        projectId: args.projectId,
        projectName: args.projectName,
        key: args.key,
      );
    },
  );
}

class NewTaskRouteArgs {
  const NewTaskRouteArgs({
    required this.projectId,
    required this.projectName,
    this.key,
  });

  final String projectId;

  final String projectName;

  final Key? key;

  @override
  String toString() {
    return 'NewTaskRouteArgs{projectId: $projectId, projectName: $projectName, key: $key}';
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! NewTaskRouteArgs) return false;
    return projectId == other.projectId &&
        projectName == other.projectName &&
        key == other.key;
  }

  @override
  int get hashCode => projectId.hashCode ^ projectName.hashCode ^ key.hashCode;
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
