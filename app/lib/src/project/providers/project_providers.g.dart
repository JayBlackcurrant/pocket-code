// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'project_providers.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// Base branches to fork a new task from (GET /projects/:id/branches).

@ProviderFor(projectBranches)
const projectBranchesProvider = ProjectBranchesFamily._();

/// Base branches to fork a new task from (GET /projects/:id/branches).

final class ProjectBranchesProvider extends $FunctionalProvider<
        AsyncValue<
            ({
              String base,
              List<String> branches,
            })>,
        ({
          String base,
          List<String> branches,
        }),
        FutureOr<
            ({
              String base,
              List<String> branches,
            })>>
    with
        $FutureModifier<
            ({
              String base,
              List<String> branches,
            })>,
        $FutureProvider<
            ({
              String base,
              List<String> branches,
            })> {
  /// Base branches to fork a new task from (GET /projects/:id/branches).
  const ProjectBranchesProvider._(
      {required ProjectBranchesFamily super.from,
      required String super.argument})
      : super(
          retry: null,
          name: r'projectBranchesProvider',
          isAutoDispose: true,
          dependencies: null,
          $allTransitiveDependencies: null,
        );

  @override
  String debugGetCreateSourceHash() => _$projectBranchesHash();

  @override
  String toString() {
    return r'projectBranchesProvider'
        ''
        '($argument)';
  }

  @$internal
  @override
  $FutureProviderElement<
      ({
        String base,
        List<String> branches,
      })> $createElement(
          $ProviderPointer pointer) =>
      $FutureProviderElement(pointer);

  @override
  FutureOr<
      ({
        String base,
        List<String> branches,
      })> create(Ref ref) {
    final argument = this.argument as String;
    return projectBranches(
      ref,
      argument,
    );
  }

  @override
  bool operator ==(Object other) {
    return other is ProjectBranchesProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$projectBranchesHash() => r'849dc566b211624e52c39360f80b23b54b3aed57';

/// Base branches to fork a new task from (GET /projects/:id/branches).

final class ProjectBranchesFamily extends $Family
    with
        $FunctionalFamilyOverride<
            FutureOr<
                ({
                  String base,
                  List<String> branches,
                })>,
            String> {
  const ProjectBranchesFamily._()
      : super(
          retry: null,
          name: r'projectBranchesProvider',
          dependencies: null,
          $allTransitiveDependencies: null,
          isAutoDispose: true,
        );

  /// Base branches to fork a new task from (GET /projects/:id/branches).

  ProjectBranchesProvider call(
    String projectId,
  ) =>
      ProjectBranchesProvider._(argument: projectId, from: this);

  @override
  String toString() => r'projectBranchesProvider';
}

/// Recent tasks for a project (GET /projects/:id/tasks), newest-first.

@ProviderFor(projectTasks)
const projectTasksProvider = ProjectTasksFamily._();

/// Recent tasks for a project (GET /projects/:id/tasks), newest-first.

final class ProjectTasksProvider extends $FunctionalProvider<
        AsyncValue<List<TaskDetail>>,
        List<TaskDetail>,
        FutureOr<List<TaskDetail>>>
    with $FutureModifier<List<TaskDetail>>, $FutureProvider<List<TaskDetail>> {
  /// Recent tasks for a project (GET /projects/:id/tasks), newest-first.
  const ProjectTasksProvider._(
      {required ProjectTasksFamily super.from, required String super.argument})
      : super(
          retry: null,
          name: r'projectTasksProvider',
          isAutoDispose: true,
          dependencies: null,
          $allTransitiveDependencies: null,
        );

  @override
  String debugGetCreateSourceHash() => _$projectTasksHash();

  @override
  String toString() {
    return r'projectTasksProvider'
        ''
        '($argument)';
  }

  @$internal
  @override
  $FutureProviderElement<List<TaskDetail>> $createElement(
          $ProviderPointer pointer) =>
      $FutureProviderElement(pointer);

  @override
  FutureOr<List<TaskDetail>> create(Ref ref) {
    final argument = this.argument as String;
    return projectTasks(
      ref,
      argument,
    );
  }

  @override
  bool operator ==(Object other) {
    return other is ProjectTasksProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$projectTasksHash() => r'2357cb4b4691561d0f1bb0769bb981d388b64def';

/// Recent tasks for a project (GET /projects/:id/tasks), newest-first.

final class ProjectTasksFamily extends $Family
    with $FunctionalFamilyOverride<FutureOr<List<TaskDetail>>, String> {
  const ProjectTasksFamily._()
      : super(
          retry: null,
          name: r'projectTasksProvider',
          dependencies: null,
          $allTransitiveDependencies: null,
          isAutoDispose: true,
        );

  /// Recent tasks for a project (GET /projects/:id/tasks), newest-first.

  ProjectTasksProvider call(
    String projectId,
  ) =>
      ProjectTasksProvider._(argument: projectId, from: this);

  @override
  String toString() => r'projectTasksProvider';
}

/// List one directory of a project (GET /projects/:id/tree?path=).

@ProviderFor(projectTree)
const projectTreeProvider = ProjectTreeFamily._();

/// List one directory of a project (GET /projects/:id/tree?path=).

final class ProjectTreeProvider extends $FunctionalProvider<
        AsyncValue<List<TreeEntry>>, List<TreeEntry>, FutureOr<List<TreeEntry>>>
    with $FutureModifier<List<TreeEntry>>, $FutureProvider<List<TreeEntry>> {
  /// List one directory of a project (GET /projects/:id/tree?path=).
  const ProjectTreeProvider._(
      {required ProjectTreeFamily super.from,
      required (
        String,
        String,
      )
          super.argument})
      : super(
          retry: null,
          name: r'projectTreeProvider',
          isAutoDispose: true,
          dependencies: null,
          $allTransitiveDependencies: null,
        );

  @override
  String debugGetCreateSourceHash() => _$projectTreeHash();

  @override
  String toString() {
    return r'projectTreeProvider'
        ''
        '$argument';
  }

  @$internal
  @override
  $FutureProviderElement<List<TreeEntry>> $createElement(
          $ProviderPointer pointer) =>
      $FutureProviderElement(pointer);

  @override
  FutureOr<List<TreeEntry>> create(Ref ref) {
    final argument = this.argument as (
      String,
      String,
    );
    return projectTree(
      ref,
      argument.$1,
      argument.$2,
    );
  }

  @override
  bool operator ==(Object other) {
    return other is ProjectTreeProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$projectTreeHash() => r'd69087bba8fdcfce42baff9f13e671ba455b64e0';

/// List one directory of a project (GET /projects/:id/tree?path=).

final class ProjectTreeFamily extends $Family
    with
        $FunctionalFamilyOverride<
            FutureOr<List<TreeEntry>>,
            (
              String,
              String,
            )> {
  const ProjectTreeFamily._()
      : super(
          retry: null,
          name: r'projectTreeProvider',
          dependencies: null,
          $allTransitiveDependencies: null,
          isAutoDispose: true,
        );

  /// List one directory of a project (GET /projects/:id/tree?path=).

  ProjectTreeProvider call(
    String projectId,
    String path,
  ) =>
      ProjectTreeProvider._(argument: (
        projectId,
        path,
      ), from: this);

  @override
  String toString() => r'projectTreeProvider';
}

/// Search project files for @-mention autocomplete (GET /projects/:id/search?q=).

@ProviderFor(projectSearch)
const projectSearchProvider = ProjectSearchFamily._();

/// Search project files for @-mention autocomplete (GET /projects/:id/search?q=).

final class ProjectSearchProvider extends $FunctionalProvider<
        AsyncValue<List<String>>, List<String>, FutureOr<List<String>>>
    with $FutureModifier<List<String>>, $FutureProvider<List<String>> {
  /// Search project files for @-mention autocomplete (GET /projects/:id/search?q=).
  const ProjectSearchProvider._(
      {required ProjectSearchFamily super.from,
      required (
        String,
        String,
      )
          super.argument})
      : super(
          retry: null,
          name: r'projectSearchProvider',
          isAutoDispose: true,
          dependencies: null,
          $allTransitiveDependencies: null,
        );

  @override
  String debugGetCreateSourceHash() => _$projectSearchHash();

  @override
  String toString() {
    return r'projectSearchProvider'
        ''
        '$argument';
  }

  @$internal
  @override
  $FutureProviderElement<List<String>> $createElement(
          $ProviderPointer pointer) =>
      $FutureProviderElement(pointer);

  @override
  FutureOr<List<String>> create(Ref ref) {
    final argument = this.argument as (
      String,
      String,
    );
    return projectSearch(
      ref,
      argument.$1,
      argument.$2,
    );
  }

  @override
  bool operator ==(Object other) {
    return other is ProjectSearchProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$projectSearchHash() => r'e2200f712b5e7c160208c999c6c17f6182b11efc';

/// Search project files for @-mention autocomplete (GET /projects/:id/search?q=).

final class ProjectSearchFamily extends $Family
    with
        $FunctionalFamilyOverride<
            FutureOr<List<String>>,
            (
              String,
              String,
            )> {
  const ProjectSearchFamily._()
      : super(
          retry: null,
          name: r'projectSearchProvider',
          dependencies: null,
          $allTransitiveDependencies: null,
          isAutoDispose: true,
        );

  /// Search project files for @-mention autocomplete (GET /projects/:id/search?q=).

  ProjectSearchProvider call(
    String projectId,
    String query,
  ) =>
      ProjectSearchProvider._(argument: (
        projectId,
        query,
      ), from: this);

  @override
  String toString() => r'projectSearchProvider';
}

/// Read a project file (GET /projects/:id/files?path=).

@ProviderFor(projectFile)
const projectFileProvider = ProjectFileFamily._();

/// Read a project file (GET /projects/:id/files?path=).

final class ProjectFileProvider extends $FunctionalProvider<
        AsyncValue<FileContent>, FileContent, FutureOr<FileContent>>
    with $FutureModifier<FileContent>, $FutureProvider<FileContent> {
  /// Read a project file (GET /projects/:id/files?path=).
  const ProjectFileProvider._(
      {required ProjectFileFamily super.from,
      required (
        String,
        String,
      )
          super.argument})
      : super(
          retry: null,
          name: r'projectFileProvider',
          isAutoDispose: true,
          dependencies: null,
          $allTransitiveDependencies: null,
        );

  @override
  String debugGetCreateSourceHash() => _$projectFileHash();

  @override
  String toString() {
    return r'projectFileProvider'
        ''
        '$argument';
  }

  @$internal
  @override
  $FutureProviderElement<FileContent> $createElement(
          $ProviderPointer pointer) =>
      $FutureProviderElement(pointer);

  @override
  FutureOr<FileContent> create(Ref ref) {
    final argument = this.argument as (
      String,
      String,
    );
    return projectFile(
      ref,
      argument.$1,
      argument.$2,
    );
  }

  @override
  bool operator ==(Object other) {
    return other is ProjectFileProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$projectFileHash() => r'68bf4f309f3991aa4e4508a395a0c0102dffdff2';

/// Read a project file (GET /projects/:id/files?path=).

final class ProjectFileFamily extends $Family
    with
        $FunctionalFamilyOverride<
            FutureOr<FileContent>,
            (
              String,
              String,
            )> {
  const ProjectFileFamily._()
      : super(
          retry: null,
          name: r'projectFileProvider',
          dependencies: null,
          $allTransitiveDependencies: null,
          isAutoDispose: true,
        );

  /// Read a project file (GET /projects/:id/files?path=).

  ProjectFileProvider call(
    String projectId,
    String path,
  ) =>
      ProjectFileProvider._(argument: (
        projectId,
        path,
      ), from: this);

  @override
  String toString() => r'projectFileProvider';
}
