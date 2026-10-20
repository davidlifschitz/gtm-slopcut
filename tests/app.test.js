import { describe, it, expect } from 'vitest';
import { loadApp } from './harness.js';

describe('comment cleaning', () => {
  it('removes the sample comment but preserves code and TODOs', () => {
    const { run } = loadApp();
    const result = run('stripFile("add.js", SAMPLE)');
    expect(result.cut).toHaveLength(1);
    expect(result.cleaned).toContain('return a + b; // sum');
    expect(result.cleaned).toContain('// TODO: handle overflow');
  });
  it('preserves comment markers inside strings', () => {
    const { run } = loadApp();
    expect(run('stripC(\'const url = "https://example.test";\').cleaned')).toBe('const url = "https://example.test";');
  });
  it('loads the sample and enables downloading', () => {
    const { window } = loadApp();
    window.document.getElementById('sample').click();
    expect(window.document.getElementById('run').disabled).toBe(false);
    expect(window.document.getElementById('c-cut').textContent).toBe('1');
  });
});
