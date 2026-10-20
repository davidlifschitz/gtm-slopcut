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

describe('archive import', () => {
  it('reports corrupt archives and continues the batch', async () => {
    const { run, window } = loadApp();
    await run('addFiles([{name:"bad.zip",size:3}, {name:"ok.js",size:10,text:async()=>"// leverage"}])');
    expect(window.document.getElementById('error').textContent).toContain('bad.zip');
    expect(run('results.length')).toBe(1);
    expect(window.document.getElementById('run').disabled).toBe(false);
  });
  it('warns about files omitted by the archive cap', async () => {
    const { run, window } = loadApp();
    await run('(async()=>{const zip=new JSZip();for(let i=0;i<21;i++)zip.file(i+".js","// note");await fromZip(await zip.generateAsync({type:"uint8array"}));})()');
    expect(run('results.length')).toBe(20);
    expect(window.document.getElementById('error').textContent).toContain('20');
  });
  it('rejects expanded source entries over the byte cap', async () => {
    const { run, window } = loadApp();
    await run('(async()=>{const zip=new JSZip();zip.file("big.js","x".repeat(MAX_BYTES+1));await fromZip(await zip.generateAsync({type:"uint8array"}));})()');
    expect(run('results.length')).toBe(0);
    expect(window.document.getElementById('error').textContent).toContain('8 MB');
  });
});

it('keeps every source when output paths collide', () => {
  const { run } = loadApp();
  expect(Array.from(run('uniqueResults([{name:"a.js"},{name:"a-2.js"},{name:"a.js"},{name:"A.js"},{name:"dir/a.js"},{name:"dir/a.js"}]).map(r=>r.name)')))
    .toEqual(['a.js','a-2.js','a-3.js','A-4.js','dir/a.js','dir/a-2.js']);
});

it('loads classic application and bundled zip scripts for file URLs', async () => {
  const { window } = loadApp();
  const scripts = Array.from(window.document.scripts);
  expect(scripts.find(s => s.getAttribute('src') === './app.js').type).not.toBe('module');
  expect(scripts.every(s => !/^https?:/.test(s.getAttribute('src') || ''))).toBe(true);
});
