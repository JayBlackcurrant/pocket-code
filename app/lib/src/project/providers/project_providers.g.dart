// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'project_providers.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
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
