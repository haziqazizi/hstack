import { describe, test, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(import.meta.dir, '..');

describe('gen-skill-docs', () => {
  const ALL_SKILLS = [
    { dir: '.', name: 'root gstack' },
    { dir: 'browse', name: 'browse' },
    { dir: 'qa', name: 'qa' },
    { dir: 'qa-report', name: 'qa-report' },
    { dir: 'review', name: 'review' },
    { dir: 'ship', name: 'ship' },
    { dir: 'plan-ceo-review', name: 'plan-ceo-review' },
    { dir: 'plan-eng-review', name: 'plan-eng-review' },
    { dir: 'retro', name: 'retro' },
    { dir: 'setup-browser-cookies', name: 'setup-browser-cookies' },
    { dir: 'gstack-upgrade', name: 'gstack-upgrade' },
    { dir: 'plan-design-review', name: 'plan-design-review' },
    { dir: 'design-review', name: 'design-review' },
    { dir: 'design-consultation', name: 'design-consultation' },
    { dir: 'document-release', name: 'document-release' },
    { dir: 'careful', name: 'careful' },
    { dir: 'freeze', name: 'freeze' },
    { dir: 'guard', name: 'guard' },
    { dir: 'unfreeze', name: 'unfreeze' },
  ];

  test('generated header is present in root and browse skills', () => {
    const root = fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf-8');
    const browse = fs.readFileSync(path.join(ROOT, 'browse', 'SKILL.md'), 'utf-8');
    expect(root).toContain('AUTO-GENERATED from SKILL.md.tmpl');
    expect(browse).toContain('AUTO-GENERATED from SKILL.md.tmpl');
  });

  test('every skill has a template and generated file', () => {
    for (const skill of ALL_SKILLS) {
      expect(fs.existsSync(path.join(ROOT, skill.dir, 'SKILL.md.tmpl'))).toBe(true);
      expect(fs.existsSync(path.join(ROOT, skill.dir, 'SKILL.md'))).toBe(true);
    }
  });

  test('generated files are fresh (match --dry-run)', () => {
    const result = Bun.spawnSync(['bun', 'run', 'scripts/gen-skill-docs.ts', '--dry-run'], {
      cwd: ROOT,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(result.exitCode).toBe(0);
    const output = result.stdout.toString();
    for (const skill of ALL_SKILLS) {
      const file = skill.dir === '.' ? 'SKILL.md' : `${skill.dir}/SKILL.md`;
      expect(output).toContain(`FRESH: ${file}`);
    }
    expect(output).not.toContain('STALE');
  });

  test('no generated SKILL.md contains unresolved placeholders', () => {
    for (const skill of ALL_SKILLS) {
      const content = fs.readFileSync(path.join(ROOT, skill.dir, 'SKILL.md'), 'utf-8');
      const unresolved = content.match(/\{\{[A-Z_]+\}\}/g);
      expect(unresolved).toBeNull();
    }
  });

  test('templates still contain expected placeholders', () => {
    const rootTmpl = fs.readFileSync(path.join(ROOT, 'SKILL.md.tmpl'), 'utf-8');
    const browseTmpl = fs.readFileSync(path.join(ROOT, 'browse', 'SKILL.md.tmpl'), 'utf-8');
    expect(rootTmpl).toContain('{{COMMAND_REFERENCE}}');
    expect(rootTmpl).toContain('{{SNAPSHOT_FLAGS}}');
    expect(rootTmpl).toContain('{{PREAMBLE}}');
    expect(browseTmpl).toContain('{{COMMAND_REFERENCE}}');
    expect(browseTmpl).toContain('{{SNAPSHOT_FLAGS}}');
    expect(browseTmpl).toContain('{{PREAMBLE}}');
  });

  test('generated root skill references agent-browser alias and not $B', () => {
    const content = fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf-8');
    expect(content).toContain('$AB');
    expect(content).not.toContain('$B ');
    expect(content).toContain('agent-browser');
  });

  test('generated browse skill documents snapshot shim and annotate screenshots', () => {
    const content = fs.readFileSync(path.join(ROOT, 'browse', 'SKILL.md'), 'utf-8');
    expect(content).toContain('diff -u .gstack/snap-$PPID-before.txt');
    expect(content).toContain('screenshot --annotate');
    expect(content).toContain('role first, then name, then ref');
  });

  test('generated setup block defines session-scoped alias', () => {
    const content = fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf-8');
    expect(content).toContain('AB="agent-browser --session gstack-$PPID"');
    expect(content).toContain('NEEDS_SETUP');
  });
});
