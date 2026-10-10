/// How a unified-diff line should be rendered.
enum DiffLineKind { added, removed, hunk, meta, context }

/// Classify one line of a unified patch. Pure + testable.
DiffLineKind classifyDiffLine(String line) {
  if (line.startsWith('@@')) return DiffLineKind.hunk;
  if (line.startsWith('+++') ||
      line.startsWith('---') ||
      line.startsWith('diff ') ||
      line.startsWith('index ') ||
      line.startsWith('new file') ||
      line.startsWith('deleted file') ||
      line.startsWith('old mode') ||
      line.startsWith('new mode') ||
      line.startsWith('rename ') ||
      line.startsWith('copy ') ||
      line.startsWith('similarity ') ||
      line.startsWith(r'\ No newline')) {
    return DiffLineKind.meta;
  }
  if (line.startsWith('+')) return DiffLineKind.added;
  if (line.startsWith('-')) return DiffLineKind.removed;
  return DiffLineKind.context;
}
