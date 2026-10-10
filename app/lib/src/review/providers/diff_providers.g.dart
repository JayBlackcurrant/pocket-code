// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'diff_providers.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// Changed files for a task (GET /tasks/:id/diff/summary).

@ProviderFor(diffSummary)
const diffSummaryProvider = DiffSummaryFamily._();

/// Changed files for a task (GET /tasks/:id/diff/summary).

final class DiffSummaryProvider extends $FunctionalProvider<
        AsyncValue<List<DiffFileSummary>>,
        List<DiffFileSummary>,
        FutureOr<List<DiffFileSummary>>>
    with
        $FutureModifier<List<DiffFileSummary>>,
        $FutureProvider<List<DiffFileSummary>> {
  /// Changed files for a task (GET /tasks/:id/diff/summary).
  const DiffSummaryProvider._(
      {required DiffSummaryFamily super.from, required String super.argument})
      : super(
          retry: null,
          name: r'diffSummaryProvider',
          isAutoDispose: true,
          dependencies: null,
          $allTransitiveDependencies: null,
        );

  @override
  String debugGetCreateSourceHash() => _$diffSummaryHash();

  @override
  String toString() {
    return r'diffSummaryProvider'
        ''
        '($argument)';
  }

  @$internal
  @override
  $FutureProviderElement<List<DiffFileSummary>> $createElement(
          $ProviderPointer pointer) =>
      $FutureProviderElement(pointer);

  @override
  FutureOr<List<DiffFileSummary>> create(Ref ref) {
    final argument = this.argument as String;
    return diffSummary(
      ref,
      argument,
    );
  }

  @override
  bool operator ==(Object other) {
    return other is DiffSummaryProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$diffSummaryHash() => r'2c0dcc2485544978c0edf0766a02abb16f75768e';

/// Changed files for a task (GET /tasks/:id/diff/summary).

final class DiffSummaryFamily extends $Family
    with $FunctionalFamilyOverride<FutureOr<List<DiffFileSummary>>, String> {
  const DiffSummaryFamily._()
      : super(
          retry: null,
          name: r'diffSummaryProvider',
          dependencies: null,
          $allTransitiveDependencies: null,
          isAutoDispose: true,
        );

  /// Changed files for a task (GET /tasks/:id/diff/summary).

  DiffSummaryProvider call(
    String taskId,
  ) =>
      DiffSummaryProvider._(argument: taskId, from: this);

  @override
  String toString() => r'diffSummaryProvider';
}

/// One file's unified patch (GET /tasks/:id/diff?path=).

@ProviderFor(fileDiff)
const fileDiffProvider = FileDiffFamily._();

/// One file's unified patch (GET /tasks/:id/diff?path=).

final class FileDiffProvider extends $FunctionalProvider<AsyncValue<FileDiff>,
        FileDiff, FutureOr<FileDiff>>
    with $FutureModifier<FileDiff>, $FutureProvider<FileDiff> {
  /// One file's unified patch (GET /tasks/:id/diff?path=).
  const FileDiffProvider._(
      {required FileDiffFamily super.from,
      required (
        String,
        String,
      )
          super.argument})
      : super(
          retry: null,
          name: r'fileDiffProvider',
          isAutoDispose: true,
          dependencies: null,
          $allTransitiveDependencies: null,
        );

  @override
  String debugGetCreateSourceHash() => _$fileDiffHash();

  @override
  String toString() {
    return r'fileDiffProvider'
        ''
        '$argument';
  }

  @$internal
  @override
  $FutureProviderElement<FileDiff> $createElement($ProviderPointer pointer) =>
      $FutureProviderElement(pointer);

  @override
  FutureOr<FileDiff> create(Ref ref) {
    final argument = this.argument as (
      String,
      String,
    );
    return fileDiff(
      ref,
      argument.$1,
      argument.$2,
    );
  }

  @override
  bool operator ==(Object other) {
    return other is FileDiffProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$fileDiffHash() => r'2af974a3d968894d6f8ca28830fb5d96c9d73831';

/// One file's unified patch (GET /tasks/:id/diff?path=).

final class FileDiffFamily extends $Family
    with
        $FunctionalFamilyOverride<
            FutureOr<FileDiff>,
            (
              String,
              String,
            )> {
  const FileDiffFamily._()
      : super(
          retry: null,
          name: r'fileDiffProvider',
          dependencies: null,
          $allTransitiveDependencies: null,
          isAutoDispose: true,
        );

  /// One file's unified patch (GET /tasks/:id/diff?path=).

  FileDiffProvider call(
    String taskId,
    String path,
  ) =>
      FileDiffProvider._(argument: (
        taskId,
        path,
      ), from: this);

  @override
  String toString() => r'fileDiffProvider';
}

/// Full file contents (GET /tasks/:id/files?path=) for the code viewer.

@ProviderFor(fileContent)
const fileContentProvider = FileContentFamily._();

/// Full file contents (GET /tasks/:id/files?path=) for the code viewer.

final class FileContentProvider extends $FunctionalProvider<
        AsyncValue<FileContent>, FileContent, FutureOr<FileContent>>
    with $FutureModifier<FileContent>, $FutureProvider<FileContent> {
  /// Full file contents (GET /tasks/:id/files?path=) for the code viewer.
  const FileContentProvider._(
      {required FileContentFamily super.from,
      required (
        String,
        String,
      )
          super.argument})
      : super(
          retry: null,
          name: r'fileContentProvider',
          isAutoDispose: true,
          dependencies: null,
          $allTransitiveDependencies: null,
        );

  @override
  String debugGetCreateSourceHash() => _$fileContentHash();

  @override
  String toString() {
    return r'fileContentProvider'
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
    return fileContent(
      ref,
      argument.$1,
      argument.$2,
    );
  }

  @override
  bool operator ==(Object other) {
    return other is FileContentProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$fileContentHash() => r'caa0ab9f36fd4132d1ac74d6e4a4d13655d1d7b0';

/// Full file contents (GET /tasks/:id/files?path=) for the code viewer.

final class FileContentFamily extends $Family
    with
        $FunctionalFamilyOverride<
            FutureOr<FileContent>,
            (
              String,
              String,
            )> {
  const FileContentFamily._()
      : super(
          retry: null,
          name: r'fileContentProvider',
          dependencies: null,
          $allTransitiveDependencies: null,
          isAutoDispose: true,
        );

  /// Full file contents (GET /tasks/:id/files?path=) for the code viewer.

  FileContentProvider call(
    String taskId,
    String path,
  ) =>
      FileContentProvider._(argument: (
        taskId,
        path,
      ), from: this);

  @override
  String toString() => r'fileContentProvider';
}
