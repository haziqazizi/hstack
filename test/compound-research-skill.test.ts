import { describe, test, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(import.meta.dir, '..');

function read(relPath: string) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf-8');
}

describe('docs-research and compound skills', () => {
  test('docs-research skill has stack-aware research workflow', () => {
    const content = read('docs-research/SKILL.md');
    expect(content).toContain('Context7');
    expect(content).toContain('gstack-web-search');
    expect(content).toContain('.claude/research/');
    expect(content).toContain('.claude/stack.yaml');
    expect(content).toContain('Candidate architectural rules');
  });

  test('compound skill captures incidents, recurring patterns, and doctrine promotions', () => {
    const content = read('compound/SKILL.md');
    for (const section of ['## Trigger', '## Symptom', '## Root cause', '## Proof', '## Human prevention', '## Agent prevention', '### Promotion decision']) {
      expect(content).toContain(section);
    }
    expect(content).toContain('.claude/compound/incidents/');
    expect(content).toContain('.claude/compound/patterns/');
    expect(content).toContain('last 8 work sessions or 21 days');
    expect(content).toContain('45-minute gap');
    expect(content).toContain('DESIGN.md');
    expect(content).toContain('.claude/architecture/rules/<stack>.md');
    expect(content).toContain('Do not reduce everything to incidents');
  });
});

describe('workflow skills consume stack, research, and learning artifacts', () => {
  test('investigate enforces proof-first debugging and anti-bruteforce behavior', () => {
    const content = read('investigate/SKILL.md');
    expect(content).toContain('2 fix attempts without new evidence');
    expect(content).toContain('Proof first');
    expect(content).toContain('/docs-research');
    expect(content).toContain('/compound');
    expect(content).toContain('.claude/architecture/rules/');
  });

  test('review checklist and skill include proof and recurrence prevention', () => {
    const checklist = read('review/checklist.md');
    const skill = read('review/SKILL.md');
    expect(checklist).toContain('Proof & Learning Loop');
    expect(skill).toContain('proof artifact');
    expect(skill).toContain('recurrence-prevention gap');
  });

  test('plan-eng-review reads stack manifest, rule files, research, and compound notes', () => {
    const content = read('plan-eng-review/SKILL.md');
    expect(content).toContain('Stack Context Check');
    expect(content).toContain('.claude/stack.yaml');
    expect(content).toContain('.claude/architecture/rules/');
    expect(content).toContain('.claude/research/');
    expect(content).toContain('.claude/compound/patterns/');
    expect(content).toContain('Stack rules & research follow-up');
  });
});
