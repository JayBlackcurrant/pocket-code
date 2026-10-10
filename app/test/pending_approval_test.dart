import 'package:flutter_test/flutter_test.dart';
import 'package:pocketcode/src/tasks/models/pending_approval.dart';

void main() {
  test('summary prefers a Bash command', () {
    const p = PendingApproval(
      toolUseId: 'tu1',
      toolName: 'Bash',
      input: {'command': 'npm run deploy'},
    );
    expect(p.summary, 'npm run deploy');
  });

  test('summary falls back to a path/url', () {
    const p = PendingApproval(
      toolUseId: 'tu2',
      toolName: 'WebFetch',
      input: {'url': 'https://example.com'},
    );
    expect(p.summary, 'https://example.com');
  });

  test('summary is empty for empty input', () {
    const p = PendingApproval(toolUseId: 'tu3', toolName: 'X', input: {});
    expect(p.summary, '');
  });
}
