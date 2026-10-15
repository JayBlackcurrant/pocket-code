// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'run_stream.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// Connects to `WS /runs/:id/stream?since=<seq>`, replays missed log lines then live-tails, and
/// reconnects (from the last seen seq) on drop — same replay contract as the build stream (S5-05),
/// so no run output is lost across a disconnect.

@ProviderFor(RunStream)
const runStreamProvider = RunStreamFamily._();

/// Connects to `WS /runs/:id/stream?since=<seq>`, replays missed log lines then live-tails, and
/// reconnects (from the last seen seq) on drop — same replay contract as the build stream (S5-05),
/// so no run output is lost across a disconnect.
final class RunStreamProvider
    extends $NotifierProvider<RunStream, RunStreamState> {
  /// Connects to `WS /runs/:id/stream?since=<seq>`, replays missed log lines then live-tails, and
  /// reconnects (from the last seen seq) on drop — same replay contract as the build stream (S5-05),
  /// so no run output is lost across a disconnect.
  const RunStreamProvider._(
      {required RunStreamFamily super.from, required String super.argument})
      : super(
          retry: null,
          name: r'runStreamProvider',
          isAutoDispose: true,
          dependencies: null,
          $allTransitiveDependencies: null,
        );

  @override
  String debugGetCreateSourceHash() => _$runStreamHash();

  @override
  String toString() {
    return r'runStreamProvider'
        ''
        '($argument)';
  }

  @$internal
  @override
  RunStream create() => RunStream();

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(RunStreamState value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<RunStreamState>(value),
    );
  }

  @override
  bool operator ==(Object other) {
    return other is RunStreamProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$runStreamHash() => r'b55422432f94ee757292af1ed5bc0393f3ad217c';

/// Connects to `WS /runs/:id/stream?since=<seq>`, replays missed log lines then live-tails, and
/// reconnects (from the last seen seq) on drop — same replay contract as the build stream (S5-05),
/// so no run output is lost across a disconnect.

final class RunStreamFamily extends $Family
    with
        $ClassFamilyOverride<RunStream, RunStreamState, RunStreamState,
            RunStreamState, String> {
  const RunStreamFamily._()
      : super(
          retry: null,
          name: r'runStreamProvider',
          dependencies: null,
          $allTransitiveDependencies: null,
          isAutoDispose: true,
        );

  /// Connects to `WS /runs/:id/stream?since=<seq>`, replays missed log lines then live-tails, and
  /// reconnects (from the last seen seq) on drop — same replay contract as the build stream (S5-05),
  /// so no run output is lost across a disconnect.

  RunStreamProvider call(
    String runId,
  ) =>
      RunStreamProvider._(argument: runId, from: this);

  @override
  String toString() => r'runStreamProvider';
}

/// Connects to `WS /runs/:id/stream?since=<seq>`, replays missed log lines then live-tails, and
/// reconnects (from the last seen seq) on drop — same replay contract as the build stream (S5-05),
/// so no run output is lost across a disconnect.

abstract class _$RunStream extends $Notifier<RunStreamState> {
  late final _$args = ref.$arg as String;
  String get runId => _$args;

  RunStreamState build(
    String runId,
  );
  @$mustCallSuper
  @override
  void runBuild() {
    final created = build(
      _$args,
    );
    final ref = this.ref as $Ref<RunStreamState, RunStreamState>;
    final element = ref.element as $ClassProviderElement<
        AnyNotifier<RunStreamState, RunStreamState>,
        RunStreamState,
        Object?,
        Object?>;
    element.handleValue(ref, created);
  }
}
