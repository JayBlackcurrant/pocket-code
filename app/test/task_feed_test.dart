import 'package:flutter_test/flutter_test.dart';
import 'package:pocketcode/src/tasks/task_feed.dart';

void main() {
  test('assistant event yields text then tool-call items', () {
    final items = mapEventToItems(5, 'agent.assistant', {
      'message': {
        'content': [
          {'type': 'text', 'text': 'Working on it'},
          {
            'type': 'tool_use',
            'name': 'Edit',
            'input': {'path': 'lib/main.dart'},
          },
        ],
      },
    });
    expect(items.length, 2);
    expect(items[0].kind, FeedKind.assistant);
    expect(items[0].body, 'Working on it');
    expect(items[1].kind, FeedKind.tool);
    expect(items[1].title, contains('Edit'));
  });

  test('result event yields a result item', () {
    final items =
        mapEventToItems(9, 'agent.result.success', {'result': 'All done'});
    expect(items.single.kind, FeedKind.result);
    expect(items.single.body, 'All done');
  });

  test('lifecycle status transitions', () {
    expect(statusFromEvent('task.started', null), 'running');
    expect(statusFromEvent('task.completed', {'status': 'done'}), 'done');
    expect(statusFromEvent('task.cancelled', null), 'cancelled');
    expect(statusFromEvent('task.error', null), 'failed');
    expect(statusFromEvent('agent.assistant', null), isNull);
  });

  test('unknown event yields no items', () {
    expect(mapEventToItems(1, 'agent.system.init', {}), isEmpty);
  });
}
