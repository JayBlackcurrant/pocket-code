import { describe, expect, it } from 'vitest';
import { CheckoutGuard } from './checkoutGuard.js';

describe('CheckoutGuard — one task + one run per project', () => {
  it('refuses a second task and a second run', () => {
    const g = new CheckoutGuard();
    expect(g.acquireTask('p', 'claude/a').ok).toBe(true);
    expect(g.acquireTask('p', 'claude/a')).toMatchObject({ ok: false });
    g.releaseTask('p');

    expect(g.acquireRun('p', 'claude/a').ok).toBe(true);
    expect(g.acquireRun('p', 'claude/a')).toMatchObject({ ok: false });
  });
});

describe('CheckoutGuard — run vs task coexistence (same branch only)', () => {
  it('a live run blocks a fresh task start (new branch differs)', () => {
    const g = new CheckoutGuard();
    expect(g.acquireRun('p', 'claude/x').ok).toBe(true);
    const res = g.acquireTask('p'); // fresh start, branch unknown
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain('live run is active on branch "claude/x"');
  });

  it('a live run allows a continued task on the same branch, blocks a different branch', () => {
    const g = new CheckoutGuard();
    g.acquireRun('p', 'claude/x');
    expect(g.acquireTask('p', 'claude/x').ok).toBe(true); // continue on the run's branch
    g.releaseTask('p');
    expect(g.acquireTask('p', 'claude/y')).toMatchObject({ ok: false }); // different branch
  });

  it('an active task blocks a run on a different branch, allows the same branch', () => {
    const g = new CheckoutGuard();
    g.acquireTask('p', 'claude/x');
    expect(g.acquireRun('p', 'claude/y')).toMatchObject({ ok: false });
    expect(g.acquireRun('p', 'claude/x').ok).toBe(true); // run the branch the task is on
  });

  it('a run cannot acquire while a fresh task start has not yet set its branch', () => {
    const g = new CheckoutGuard();
    g.acquireTask('p'); // branch still null (mid-start)
    expect(g.acquireRun('p', 'claude/x')).toMatchObject({ ok: false });
    g.setTaskBranch('p', 'claude/x'); // branch now known
    expect(g.acquireRun('p', 'claude/x').ok).toBe(true); // same branch → allowed
  });

  it('releasing frees the slot for the other kind', () => {
    const g = new CheckoutGuard();
    g.acquireRun('p', 'claude/x');
    expect(g.hasRun('p')).toBe(true);
    expect(g.runBranch('p')).toBe('claude/x');
    g.releaseRun('p');
    expect(g.hasRun('p')).toBe(false);
    expect(g.acquireTask('p').ok).toBe(true); // fresh start now fine
  });

  it('keeps projects independent', () => {
    const g = new CheckoutGuard();
    g.acquireRun('a', 'claude/x');
    expect(g.acquireTask('b').ok).toBe(true); // different project unaffected
  });
});
