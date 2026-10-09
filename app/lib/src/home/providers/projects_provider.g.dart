// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'projects_provider.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// Loads the registered projects from the paired daemon (proves auth works).

@ProviderFor(projects)
const projectsProvider = ProjectsProvider._();

/// Loads the registered projects from the paired daemon (proves auth works).

final class ProjectsProvider extends $FunctionalProvider<
        AsyncValue<List<ProjectSummary>>,
        List<ProjectSummary>,
        FutureOr<List<ProjectSummary>>>
    with
        $FutureModifier<List<ProjectSummary>>,
        $FutureProvider<List<ProjectSummary>> {
  /// Loads the registered projects from the paired daemon (proves auth works).
  const ProjectsProvider._()
      : super(
          from: null,
          argument: null,
          retry: null,
          name: r'projectsProvider',
          isAutoDispose: true,
          dependencies: null,
          $allTransitiveDependencies: null,
        );

  @override
  String debugGetCreateSourceHash() => _$projectsHash();

  @$internal
  @override
  $FutureProviderElement<List<ProjectSummary>> $createElement(
          $ProviderPointer pointer) =>
      $FutureProviderElement(pointer);

  @override
  FutureOr<List<ProjectSummary>> create(Ref ref) {
    return projects(ref);
  }
}

String _$projectsHash() => r'7cd8eb916cc36c63760f488e60b1a5bab0a12f70';
