import 'app_notification.dart';

/// UI state for the global notifications inbox (S3-05).
class NotificationsState {
  const NotificationsState({
    required this.items,
    required this.unread,
    required this.connected,
  });

  /// Newest-first.
  final List<AppNotification> items;
  final int unread;
  final bool connected;

  factory NotificationsState.initial() =>
      const NotificationsState(items: [], unread: 0, connected: false);

  NotificationsState copyWith({
    List<AppNotification>? items,
    int? unread,
    bool? connected,
  }) {
    return NotificationsState(
      items: items ?? this.items,
      unread: unread ?? this.unread,
      connected: connected ?? this.connected,
    );
  }
}
