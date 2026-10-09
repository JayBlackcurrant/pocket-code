import 'package:flutter_test/flutter_test.dart';
import 'package:pocketcode/src/tasks/models/started_task.dart';
import 'package:pocketcode/src/tasks/models/task_detail.dart';

void main() {
  test('StartedTask.fromJson', () {
    final s = StartedTask.fromJson({
      'taskId': 't123',
      'branch': 'claude/add-banner',
      'worktree': '/w/t123',
    });
    expect(s.taskId, 't123');
    expect(s.branch, 'claude/add-banner');
  });

  test('TaskDetail.fromJson handles nulls', () {
    final t = TaskDetail.fromJson({
      'id': 't1',
      'projectId': 'hedged',
      'branch': 'claude/x',
      'worktree': '/w',
      'status': 'running',
      'sessionId': null,
      'costUsd': null,
    });
    expect(t.status, 'running');
    expect(t.sessionId, isNull);
    expect(t.costUsd, isNull);
  });

  test('TaskDetail.fromJson parses cost', () {
    final t = TaskDetail.fromJson({
      'id': 't1',
      'projectId': 'hedged',
      'branch': 'b',
      'worktree': 'w',
      'status': 'done',
      'sessionId': 'sess-1',
      'costUsd': 0.0123,
    });
    expect(t.costUsd, closeTo(0.0123, 1e-9));
    expect(t.sessionId, 'sess-1');
  });
}
