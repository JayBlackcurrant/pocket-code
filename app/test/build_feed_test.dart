import 'package:flutter_test/flutter_test.dart';
import 'package:pocketcode/src/builds/build_feed.dart';

void main() {
  group('mapBuildEvent', () {
    test('log + upload_log become monospace log lines', () {
      final a = mapBuildEvent(1, 'build.log', {'stream': 'stdout', 'line': 'Running Gradle'});
      final b = mapBuildEvent(2, 'build.upload_log', {'stream': 'stderr', 'line': 'Uploading'});
      expect(a!.kind, BuildLineKind.log);
      expect(a.text, 'Running Gradle');
      expect(b!.kind, BuildLineKind.log);
      expect(b.text, 'Uploading');
    });

    test('step shows 1-based index and the command', () {
      final line = mapBuildEvent(3, 'build.step', {
        'index': 0,
        'total': 3,
        'command': 'fvm flutter pub get',
      });
      expect(line!.kind, BuildLineKind.step);
      expect(line.text, contains('step 1/3'));
      expect(line.text, contains('fvm flutter pub get'));
    });

    test('error carries the reason', () {
      final line = mapBuildEvent(4, 'build.error', {'reason': 'step 1/3 failed', 'exitCode': 2});
      expect(line!.kind, BuildLineKind.error);
      expect(line.text, 'step 1/3 failed');
    });

    test('completed + upload_completed are success lines', () {
      expect(mapBuildEvent(5, 'build.completed', {})!.kind, BuildLineKind.success);
      expect(mapBuildEvent(6, 'build.upload_completed', {})!.kind, BuildLineKind.success);
    });

    test('created produces no line', () {
      expect(mapBuildEvent(7, 'build.created', {'projectId': 'hedged'}), isNull);
    });
  });

  group('status reducers', () {
    test('buildStatusFromEvent maps lifecycle events', () {
      expect(buildStatusFromEvent('build.created', {}), 'queued');
      expect(buildStatusFromEvent('build.started', {}), 'running');
      expect(buildStatusFromEvent('build.completed', {}), 'succeeded');
      expect(buildStatusFromEvent('build.error', {}), 'failed');
      expect(buildStatusFromEvent('build.cancelled', {}), 'cancelled');
      expect(buildStatusFromEvent('build.log', {}), isNull);
    });

    test('uploadStatusFromEvent maps upload events', () {
      expect(uploadStatusFromEvent('build.upload_started', {}), 'uploading');
      expect(uploadStatusFromEvent('build.upload_completed', {}), 'uploaded');
      expect(uploadStatusFromEvent('build.upload_error', {}), 'failed');
      expect(uploadStatusFromEvent('build.started', {}), isNull);
    });

    test('releaseUrlFromEvent extracts the console link only on completion', () {
      expect(
        releaseUrlFromEvent('build.upload_completed', {'releaseUrl': 'https://console.firebase/x'}),
        'https://console.firebase/x',
      );
      expect(releaseUrlFromEvent('build.upload_completed', {'releaseUrl': ''}), isNull);
      expect(releaseUrlFromEvent('build.upload_started', {'releaseUrl': 'x'}), isNull);
    });
  });
}
