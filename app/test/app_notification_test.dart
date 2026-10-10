import 'package:flutter_test/flutter_test.dart';
import 'package:pocketcode/src/notifications/models/app_notification.dart';

void main() {
  test('AppNotification.fromJson parses fields and read flag', () {
    final n = AppNotification.fromJson({
      'seq': 7,
      'kind': 'buildReady',
      'title': 'Build ready',
      'body': 'The APK built successfully.',
      'taskId': 't1',
      'buildId': 'b1',
      'createdAt': 123,
      'read': false,
    });
    expect(n.seq, 7);
    expect(n.kind, 'buildReady');
    expect(n.taskId, 't1');
    expect(n.buildId, 'b1');
    expect(n.read, isFalse);
  });

  test('AppNotification.fromJson tolerates missing optional fields', () {
    final n = AppNotification.fromJson({'seq': 1, 'kind': 'approval', 'title': 'x', 'body': 'y'});
    expect(n.taskId, isNull);
    expect(n.read, isFalse);
    expect(n.createdAt, 0);
  });

  test('copyWith(read: true) marks read, keeps the rest', () {
    final n = AppNotification.fromJson({'seq': 2, 'kind': 'approval', 'title': 'a', 'body': 'b'})
        .copyWith(read: true);
    expect(n.read, isTrue);
    expect(n.title, 'a');
    expect(n.seq, 2);
  });
}
