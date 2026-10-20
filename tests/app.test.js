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

describe('code preservation', () => {
  it('does not join identifiers across removed comments', () => {
    const { run } = loadApp();
    expect(run('stripC("return/* leverage */value").cleaned')).toBe('return value');
  });
  it('retains newlines that affect automatic semicolon insertion', () => {
    const { run } = loadApp();
    expect(run('stripC("return/* leverage\\n */value").cleaned')).toBe('return\nvalue');
  });
  it('does not normalize whitespace inside template strings', () => {
    const { run } = loadApp();
    const source = 'const text = `one  \n\n\nend`;';
    expect(run(`stripC(${JSON.stringify(source)}).cleaned`)).toBe(source);
  });
  it('preserves escaped single quotes and apparent comments in strings', () => {
    const { run } = loadApp();
    const source = "const s = 'it\\'s // leverage';";
    expect(run(`stripC(${JSON.stringify(source)}).cleaned`)).toBe(source);
  });
});
