import 'package:flutter_test/flutter_test.dart';
import 'package:pocketcode/src/review/diff_line.dart';
import 'package:pocketcode/src/review/models/diff_file.dart';

void main() {
  test('classifies unified diff lines', () {
    expect(classifyDiffLine('+added'), DiffLineKind.added);
    expect(classifyDiffLine('-removed'), DiffLineKind.removed);
    expect(classifyDiffLine('@@ -1,2 +1,3 @@'), DiffLineKind.hunk);
    expect(classifyDiffLine('+++ b/file'), DiffLineKind.meta);
    expect(classifyDiffLine('--- a/file'), DiffLineKind.meta);
    expect(classifyDiffLine('diff --git a/x b/x'), DiffLineKind.meta);
    expect(classifyDiffLine(' context'), DiffLineKind.context);
  });

  test('DiffFileSummary.isGenerated flags codegen + lockfiles', () {
    DiffFileSummary f(String p) => DiffFileSummary(
          path: p,
          oldPath: null,
          status: 'modified',
          additions: 0,
          deletions: 0,
          binary: false,
        );
    expect(f('lib/x.g.dart').isGenerated, true);
    expect(f('lib/x.gr.dart').isGenerated, true);
    expect(f('lib/x.freezed.dart').isGenerated, true);
    expect(f('pubspec.lock').isGenerated, true);
    expect(f('lib/main.dart').isGenerated, false);
  });
}
