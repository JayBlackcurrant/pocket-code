// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'notifications_stream.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// Global notifications inbox (S3-05). Loads recent notifications once (GET /notifications),
/// then live-tails `WS /notifications/stream?since=<seq>` and reconnects on drop. keepAlive so
/// the unread badge stays live across screens; self-contained (no external push service).

@ProviderFor(NotificationsStream)
const notificationsStreamProvider = NotificationsStreamProvider._();

/// Global notifications inbox (S3-05). Loads recent notifications once (GET /notifications),
/// then live-tails `WS /notifications/stream?since=<seq>` and reconnects on drop. keepAlive so
/// the unread badge stays live across screens; self-contained (no external push service).
final class NotificationsStreamProvider
    extends $NotifierProvider<NotificationsStream, NotificationsState> {
  /// Global notifications inbox (S3-05). Loads recent notifications once (GET /notifications),
  /// then live-tails `WS /notifications/stream?since=<seq>` and reconnects on drop. keepAlive so
  /// the unread badge stays live across screens; self-contained (no external push service).
  const NotificationsStreamProvider._()
      : super(
          from: null,
          argument: null,
          retry: null,
          name: r'notificationsStreamProvider',
          isAutoDispose: false,
          dependencies: null,
          $allTransitiveDependencies: null,
        );

  @override
  String debugGetCreateSourceHash() => _$notificationsStreamHash();

  @$internal
  @override
  NotificationsStream create() => NotificationsStream();

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(NotificationsState value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<NotificationsState>(value),
    );
  }
}

String _$notificationsStreamHash() =>
    r'95ebca1cc1e7d4cf095a3fb645ec9dadf6b4ae73';

/// Global notifications inbox (S3-05). Loads recent notifications once (GET /notifications),
/// then live-tails `WS /notifications/stream?since=<seq>` and reconnects on drop. keepAlive so
/// the unread badge stays live across screens; self-contained (no external push service).

abstract class _$NotificationsStream extends $Notifier<NotificationsState> {
  NotificationsState build();
  @$mustCallSuper
  @override
  void runBuild() {
    final created = build();
    final ref = this.ref as $Ref<NotificationsState, NotificationsState>;
    final element = ref.element as $ClassProviderElement<
        AnyNotifier<NotificationsState, NotificationsState>,
        NotificationsState,
        Object?,
        Object?>;
    element.handleValue(ref, created);
  }
}
