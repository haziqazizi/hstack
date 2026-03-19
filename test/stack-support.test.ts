import { describe, test, expect } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { bootstrapProjectStack, detectStacks, loadStackRegistry } from '../scripts/stack-support';

function withTempProject(fn: (dir: string) => void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gstack-stack-'));
  try {
    fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('stack registry and bootstrap', () => {
  test('registry loads seeded packs', () => {
    const registry = loadStackRegistry();
    expect(registry.packs.map(pack => pack.name)).toEqual(['rails', 'react', 'django', 'flutter']);
  });

  test('detectStacks detects react from package.json dependencies', () => {
    withTempProject(dir => {
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { react: '^19.0.0' } }, null, 2));
      const detected = detectStacks(dir, loadStackRegistry()).map(pack => pack.name);
      expect(detected).toContain('react');
    });
  });

  test('detectStacks detects django from manage.py + requirements', () => {
    withTempProject(dir => {
      fs.writeFileSync(path.join(dir, 'manage.py'), '#!/usr/bin/env python\n');
      fs.writeFileSync(path.join(dir, 'requirements.txt'), 'Django==5.1.0\n');
      const detected = detectStacks(dir, loadStackRegistry()).map(pack => pack.name);
      expect(detected).toContain('django');
    });
  });

  test('bootstrap scaffolds manifest, rule file, architecture doc, and CLAUDE section', () => {
    withTempProject(dir => {
      fs.mkdirSync(path.join(dir, 'config'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'Gemfile'), "source 'https://rubygems.org'\ngem 'rails'\n");
      fs.writeFileSync(path.join(dir, 'config', 'application.rb'), 'module Demo; end\n');

      const result = bootstrapProjectStack(dir, loadStackRegistry());

      expect(result.manifestCreated).toBe(true);
      expect(result.selected).toContain('rails');
      expect(fs.existsSync(path.join(dir, '.claude', 'stack.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(dir, '.claude', 'architecture', 'rules', 'rails.md'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'docs', 'architecture', 'stacks', 'rails.md'))).toBe(true);
      const claude = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf-8');
      expect(claude).toContain('Stack-Aware Research & Architecture');
      expect(claude).toContain('/docs-research');
      expect(claude).toContain('/compound');
    });
  });

  test('bootstrap respects existing stack manifest and does not overwrite rule files', () => {
    withTempProject(dir => {
      fs.mkdirSync(path.join(dir, '.claude', 'architecture', 'rules'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'docs', 'architecture', 'stacks'), { recursive: true });
      fs.writeFileSync(path.join(dir, '.claude', 'stack.yaml'), `current:\n  - name: react\n    role: frontend\nproposed:\n  - name: flutter\n    role: mobile\nresearch:\n  providers:\n    - context7\n    - web-search\nactive_rule_files:\n  - .claude/architecture/rules/react.md\n  - .claude/architecture/rules/flutter.md\n`);
      fs.writeFileSync(path.join(dir, '.claude', 'architecture', 'rules', 'react.md'), '# custom react rules\n');

      const result = bootstrapProjectStack(dir, loadStackRegistry());

      expect(result.manifestCreated).toBe(false);
      expect(result.selected).toEqual(['react', 'flutter']);
      expect(fs.readFileSync(path.join(dir, '.claude', 'architecture', 'rules', 'react.md'), 'utf-8')).toBe('# custom react rules\n');
      expect(fs.existsSync(path.join(dir, '.claude', 'architecture', 'rules', 'flutter.md'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'docs', 'architecture', 'stacks', 'flutter.md'))).toBe(true);
    });
  });
});
