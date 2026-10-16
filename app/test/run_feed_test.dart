import 'package:flutter_test/flutter_test.dart';
import 'package:pocketcode/src/run/models/device.dart';
import 'package:pocketcode/src/run/models/run_row.dart';
import 'package:pocketcode/src/run/run_feed.dart';

void main() {
  group('mapRunEvent', () {
    test('run.log becomes a monospace log line', () {
      final l = mapRunEvent(1, 'run.log', {'stream': 'stdout', 'line': 'I/flutter: hi'});
      expect(l!.kind, RunLineKind.log);
      expect(l.text, 'I/flutter: hi');
    });

    test('started / reload / reloaded carry the right kinds', () {
      expect(mapRunEvent(2, 'run.started', {'appId': 'a1'})!.kind, RunLineKind.success);
      expect(mapRunEvent(3, 'run.reload', {})!.kind, RunLineKind.reload);
      expect(mapRunEvent(4, 'run.autoreload', {'taskId': 't1'})!.kind, RunLineKind.reload);
      final reloaded = mapRunEvent(5, 'run.reloaded', {'code': 0, 'message': 'Reloaded in 231ms'})!;
      expect(reloaded.kind, RunLineKind.success);
      expect(reloaded.text, 'Reloaded in 231ms');
    });

    test('a failed reload is an error line but keeps running status', () {
      final l = mapRunEvent(6, 'run.reload_failed', {'code': 1, 'message': 'compile error'})!;
      expect(l.kind, RunLineKind.error);
      expect(l.text, contains('compile error'));
      expect(runStatusFromEvent('run.reload_failed', {}), 'running');
    });

    test('progress with an empty message is dropped', () {
      expect(mapRunEvent(7, 'run.progress', {'message': ''}), isNull);
      expect(mapRunEvent(8, 'run.progress', {'message': 'Launching'})!.text, 'Launching');
    });

    test('run.created and run.debugPort produce no line', () {
      expect(mapRunEvent(9, 'run.created', {}), isNull);
      expect(mapRunEvent(10, 'run.debugPort', {'wsUri': 'ws://x'}), isNull);
    });

    test('run.console: a log is a console line with a level tag; an error is an error line', () {
      final log = mapRunEvent(11, 'run.console', {'source': 'log', 'level': 'INFO', 'text': 'hi'})!;
      expect(log.kind, RunLineKind.console);
      expect(log.text, 'INFO  hi');
      final err = mapRunEvent(12, 'run.console', {'source': 'error', 'level': 'SEVERE', 'text': 'overflow'})!;
      expect(err.kind, RunLineKind.error);
      expect(err.text, contains('overflow'));
    });
  });

  group('runStatusFromEvent', () {
    test('maps lifecycle events', () {
      expect(runStatusFromEvent('run.created', {}), 'starting');
      expect(runStatusFromEvent('run.started', {}), 'running');
      expect(runStatusFromEvent('run.reload', {}), 'reloading');
      expect(runStatusFromEvent('run.reloaded', {}), 'running');
      expect(runStatusFromEvent('run.stopped', {}), 'stopped');
      expect(runStatusFromEvent('run.error', {}), 'failed');
      expect(runStatusFromEvent('run.log', {}), isNull);
    });
  });

  group('debugUriFromEvent', () {
    test('prefers wsUri, falls back to baseUri', () {
      expect(debugUriFromEvent('run.debugPort', {'wsUri': 'ws://x/ws', 'baseUri': 'http://x'}), 'ws://x/ws');
      expect(debugUriFromEvent('run.debugPort', {'wsUri': '', 'baseUri': 'http://x'}), 'http://x');
      expect(debugUriFromEvent('run.log', {}), isNull);
    });
  });

  group('RunRow.fromJson', () {
    test('parses fields and status helpers', () {
      final r = RunRow.fromJson({
        'id': 'r1',
        'projectId': 'hedged',
        'status': 'running',
        'branch': 'claude/x',
        'taskId': 't1',
        'deviceSerial': '100.1.1.1:5555',
      });
      expect(r.id, 'r1');
      expect(r.running, true);
      expect(r.active, true);
      expect(r.finished, false);
    });
  });

  group('DeviceDiscovery.fromJson', () {
    test('parses the cascade result and primary device', () {
      final d = DeviceDiscovery.fromJson({
        'host': '100.1.1.1',
        'port': 5555,
        'connected': true,
        'reArmNeeded': false,
        'quality': 'relay',
        'devices': [
          {'serial': '100.1.1.1:5555', 'name': 'realme', 'flutterVisible': true},
        ],
      });
      expect(d.connected, true);
      expect(d.quality, 'relay');
      expect(d.primary?.serial, '100.1.1.1:5555');
      expect(d.primary?.flutterVisible, true);
    });

    test('handles a re-arm-needed result with no devices', () {
      final d = DeviceDiscovery.fromJson({
        'host': '100.1.1.1',
        'port': null,
        'connected': false,
        'reArmNeeded': true,
        'quality': 'unknown',
        'devices': [],
      });
      expect(d.reArmNeeded, true);
      expect(d.primary, isNull);
    });
  });
}
