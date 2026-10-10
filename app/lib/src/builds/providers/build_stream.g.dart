// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'build_stream.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// Connects to `WS /builds/:id/stream?since=<seq>`, replays missed log lines then
/// live-tails, and reconnects (from the last seen seq) on drop — same replay contract as
/// the task stream (S1-06), so no log output is lost across a disconnect.

@ProviderFor(BuildStream)
const buildStreamProvider = BuildStreamFamily._();

/// Connects to `WS /builds/:id/stream?since=<seq>`, replays missed log lines then
/// live-tails, and reconnects (from the last seen seq) on drop — same replay contract as
/// the task stream (S1-06), so no log output is lost across a disconnect.
final class BuildStreamProvider
    extends $NotifierProvider<BuildStream, BuildStreamState> {
  /// Connects to `WS /builds/:id/stream?since=<seq>`, replays missed log lines then
  /// live-tails, and reconnects (from the last seen seq) on drop — same replay contract as
  /// the task stream (S1-06), so no log output is lost across a disconnect.
  const BuildStreamProvider._(
      {required BuildStreamFamily super.from, required String super.argument})
      : super(
          retry: null,
          name: r'buildStreamProvider',
          isAutoDispose: true,
          dependencies: null,
          $allTransitiveDependencies: null,
        );

  @override
  String debugGetCreateSourceHash() => _$buildStreamHash();

  @override
  String toString() {
    return r'buildStreamProvider'
        ''
        '($argument)';
  }

  @$internal
  @override
  BuildStream create() => BuildStream();

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(BuildStreamState value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<BuildStreamState>(value),
    );
  }

  @override
  bool operator ==(Object other) {
    return other is BuildStreamProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$buildStreamHash() => r'0810daff263c8002603e12ff04b30b8730f0ac59';

/// Connects to `WS /builds/:id/stream?since=<seq>`, replays missed log lines then
/// live-tails, and reconnects (from the last seen seq) on drop — same replay contract as
/// the task stream (S1-06), so no log output is lost across a disconnect.

final class BuildStreamFamily extends $Family
    with
        $ClassFamilyOverride<BuildStream, BuildStreamState, BuildStreamState,
            BuildStreamState, String> {
  const BuildStreamFamily._()
      : super(
          retry: null,
          name: r'buildStreamProvider',
          dependencies: null,
          $allTransitiveDependencies: null,
          isAutoDispose: true,
        );

  /// Connects to `WS /builds/:id/stream?since=<seq>`, replays missed log lines then
  /// live-tails, and reconnects (from the last seen seq) on drop — same replay contract as
  /// the task stream (S1-06), so no log output is lost across a disconnect.

  BuildStreamProvider call(
    String buildId,
  ) =>
      BuildStreamProvider._(argument: buildId, from: this);

  @override
  String toString() => r'buildStreamProvider';
}

/// Connects to `WS /builds/:id/stream?since=<seq>`, replays missed log lines then
/// live-tails, and reconnects (from the last seen seq) on drop — same replay contract as
/// the task stream (S1-06), so no log output is lost across a disconnect.

abstract class _$BuildStream extends $Notifier<BuildStreamState> {
  late final _$args = ref.$arg as String;
  String get buildId => _$args;

  BuildStreamState build(
    String buildId,
  );
  @$mustCallSuper
  @override
  void runBuild() {
    final created = build(
      _$args,
    );
    final ref = this.ref as $Ref<BuildStreamState, BuildStreamState>;
    final element = ref.element as $ClassProviderElement<
        AnyNotifier<BuildStreamState, BuildStreamState>,
        BuildStreamState,
        Object?,
        Object?>;
    element.handleValue(ref, created);
  }
}
