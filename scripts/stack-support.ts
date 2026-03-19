import * as fs from 'fs';
import * as path from 'path';
import YAML from 'yaml';

const ROOT = path.resolve(import.meta.dir, '..');

export type DetectionRule =
  | { type: 'file_exists'; any_of: string[] }
  | { type: 'file_contains'; path: string; any_of: string[] }
  | { type: 'file_contains_any'; paths: string[]; any_of: string[] }
  | { type: 'package_json_dep'; any_of: string[] };

export interface StackPack {
  name: string;
  role: string;
  libraries?: string[];
  research_queries?: string[];
  detect?: DetectionRule[];
}

export interface StackRegistry {
  packs: StackPack[];
}

export interface StackEntry {
  name: string;
  role: string;
}

export interface StackManifest {
  current: StackEntry[];
  proposed: StackEntry[];
  research: { providers: string[] };
  active_rule_files: string[];
}

export interface BootstrapResult {
  projectRoot: string;
  detected: string[];
  selected: string[];
  manifestPath: string;
  manifestCreated: boolean;
  scaffoldedRuleFiles: string[];
  scaffoldedArchitectureDocs: string[];
  claudeCreated: boolean;
  claudeUpdated: boolean;
}

function readYamlFile<T>(filePath: string): T {
  return YAML.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

function normalizeStringList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.map(v => String(v)).filter(Boolean);
}

export function loadStackRegistry(registryPath = path.join(ROOT, 'stacks', 'registry.yaml')): StackRegistry {
  const registry = readYamlFile<{ packs: string[] }>(registryPath);
  const packNames = normalizeStringList(registry.packs);
  return {
    packs: packNames.map(name => {
      const packPath = path.join(ROOT, 'stacks', 'packs', name, 'pack.yaml');
      const pack = readYamlFile<StackPack>(packPath);
      return {
        ...pack,
        libraries: normalizeStringList(pack.libraries),
        research_queries: normalizeStringList(pack.research_queries),
        detect: Array.isArray(pack.detect) ? pack.detect : [],
      };
    }),
  };
}

function safeRead(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

function readPackageJsonDeps(projectRoot: string): Set<string> {
  const packageJsonPath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(packageJsonPath)) return new Set();
  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as Record<string, any>;
    return new Set([
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.devDependencies || {}),
      ...Object.keys(pkg.peerDependencies || {}),
    ]);
  } catch {
    return new Set();
  }
}

function ruleMatches(projectRoot: string, rule: DetectionRule, packageDeps: Set<string>): boolean {
  switch (rule.type) {
    case 'file_exists':
      return rule.any_of.some(rel => fs.existsSync(path.join(projectRoot, rel)));
    case 'file_contains': {
      const content = safeRead(path.join(projectRoot, rule.path));
      return !!content && rule.any_of.some(fragment => content.includes(fragment));
    }
    case 'file_contains_any':
      return rule.paths.some(rel => {
        const content = safeRead(path.join(projectRoot, rel));
        return !!content && rule.any_of.some(fragment => content.includes(fragment));
      });
    case 'package_json_dep':
      return rule.any_of.some(dep => packageDeps.has(dep));
    default:
      return false;
  }
}

export function detectStacks(projectRoot: string, registry = loadStackRegistry()): StackPack[] {
  const packageDeps = readPackageJsonDeps(projectRoot);
  return registry.packs.filter(pack => (pack.detect || []).every(rule => ruleMatches(projectRoot, rule, packageDeps)));
}

function resolveAgentDir(projectRoot: string): string {
  const agentsDir = path.join(projectRoot, '.agents');
  const claudeDir = path.join(projectRoot, '.claude');
  if (fs.existsSync(agentsDir)) return agentsDir;
  if (fs.existsSync(claudeDir)) return claudeDir;
  return agentsDir; // default to .agents for new projects
}

export function manifestPathFor(projectRoot: string): string {
  return path.join(resolveAgentDir(projectRoot), 'stack.yaml');
}

export function loadStackManifest(projectRoot: string): StackManifest | null {
  const manifestPath = manifestPathFor(projectRoot);
  if (!fs.existsSync(manifestPath)) return null;
  return readYamlFile<StackManifest>(manifestPath);
}

function uniqueEntries(entries: StackEntry[]): StackEntry[] {
  const seen = new Set<string>();
  const result: StackEntry[] = [];
  for (const entry of entries) {
    if (!entry?.name || seen.has(entry.name)) continue;
    seen.add(entry.name);
    result.push({ name: entry.name, role: entry.role || 'unknown' });
  }
  return result;
}

export function createDefaultManifest(packs: StackPack[]): StackManifest {
  const current = uniqueEntries(packs.map(pack => ({ name: pack.name, role: pack.role })));
  const activeRuleFiles = current.map(entry => `.agents/architecture/rules/${entry.name}.md`);
  return {
    current,
    proposed: [],
    research: { providers: ['context7', 'web-search'] },
    active_rule_files: activeRuleFiles,
  };
}

function renderBulletList(items: string[], fallback: string): string {
  if (items.length === 0) return `- ${fallback}`;
  return items.map(item => `- ${item}`).join('\n');
}

export function renderTemplate(templatePath: string, pack: StackPack): string {
  const template = fs.readFileSync(templatePath, 'utf-8');
  return template
    .replace(/\{\{STACK_NAME\}\}/g, pack.name)
    .replace(/\{\{STACK_ROLE\}\}/g, pack.role)
    .replace(/\{\{LIBRARIES_BULLETS\}\}/g, renderBulletList(pack.libraries || [], `Document the key ${pack.name} libraries used here.`))
    .replace(/\{\{RESEARCH_TOPICS_BULLETS\}\}/g, renderBulletList(pack.research_queries || [], `Add research prompts that matter for ${pack.name} in this repo.`));
}

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function ensureClaudeSection(projectRoot: string): { created: boolean; updated: boolean } {
  // Prefer AGENTS.md, fallback to CLAUDE.md
  const agentsPath = path.join(projectRoot, 'AGENTS.md');
  const claudePath = path.join(projectRoot, 'CLAUDE.md');
  const targetPath = fs.existsSync(agentsPath) ? agentsPath : fs.existsSync(claudePath) ? claudePath : agentsPath;
  const heading = '## Stack-Aware Research & Architecture';
  const section = `${heading}\n- Use /docs-research before introducing unfamiliar libraries, changing framework behavior, or proposing a new stack.\n- Read the agent config directory's stack.yaml and architecture/rules/ before touching architecture (check .agents/ first, then .claude/).\n- For reproducible bugs: write a failing test or equivalent proof first, then fix it, then show the proof passes.\n- After 2 failed fix attempts without new evidence, stop brute forcing and research the docs and existing code.\n- After painful bugs or surprising fixes, run /compound to capture the lesson and decide what should change next time.\n`;

  if (!fs.existsSync(targetPath)) {
    fs.writeFileSync(targetPath, `# Agent Guidance\n\n${section}`);
    return { created: true, updated: true };
  }

  const content = fs.readFileSync(targetPath, 'utf-8');
  if (content.includes(heading)) {
    return { created: false, updated: false };
  }

  const next = `${content.trimEnd()}\n\n${section}`;
  fs.writeFileSync(targetPath, `${next.trimEnd()}\n`);
  return { created: false, updated: true };
}

function packNamesFromManifest(manifest: StackManifest): string[] {
  const names = [
    ...(manifest.current || []).map(entry => entry.name),
    ...(manifest.proposed || []).map(entry => entry.name),
  ];
  return [...new Set(names.filter(Boolean))];
}

export function bootstrapProjectStack(projectRoot: string, registry = loadStackRegistry()): BootstrapResult {
  const detectedPacks = detectStacks(projectRoot, registry);
  const manifestPath = manifestPathFor(projectRoot);
  const manifest = loadStackManifest(projectRoot);
  const createdManifest = !manifest;
  const effectiveManifest = manifest || createDefaultManifest(detectedPacks);

  const agentDir = resolveAgentDir(projectRoot);
  ensureDir(agentDir);
  ensureDir(path.join(agentDir, 'research'));
  ensureDir(path.join(agentDir, 'compound', 'incidents'));
  ensureDir(path.join(agentDir, 'compound', 'patterns'));
  ensureDir(path.join(agentDir, 'architecture', 'rules'));
  ensureDir(path.join(projectRoot, 'docs', 'architecture', 'stacks'));

  if (createdManifest) {
    fs.writeFileSync(manifestPath, YAML.stringify(effectiveManifest));
  }

  const selectedNames = packNamesFromManifest(effectiveManifest);
  const packByName = new Map(registry.packs.map(pack => [pack.name, pack]));
  const scaffoldedRuleFiles: string[] = [];
  const scaffoldedArchitectureDocs: string[] = [];

  for (const stackName of selectedNames) {
    const pack = packByName.get(stackName);
    if (!pack) continue;

    const rulesPath = path.join(agentDir, 'architecture', 'rules', `${stackName}.md`);
    if (!fs.existsSync(rulesPath)) {
      const templatePath = path.join(ROOT, 'stacks', 'packs', stackName, 'rules.md.tmpl');
      fs.writeFileSync(rulesPath, renderTemplate(templatePath, pack));
      scaffoldedRuleFiles.push(path.relative(projectRoot, rulesPath));
    }

    const architecturePath = path.join(projectRoot, 'docs', 'architecture', 'stacks', `${stackName}.md`);
    if (!fs.existsSync(architecturePath)) {
      const templatePath = path.join(ROOT, 'stacks', 'packs', stackName, 'architecture.md.tmpl');
      fs.writeFileSync(architecturePath, renderTemplate(templatePath, pack));
      scaffoldedArchitectureDocs.push(path.relative(projectRoot, architecturePath));
    }
  }

  const claude = ensureClaudeSection(projectRoot);

  return {
    projectRoot,
    detected: detectedPacks.map(pack => pack.name),
    selected: selectedNames,
    manifestPath,
    manifestCreated: createdManifest,
    scaffoldedRuleFiles,
    scaffoldedArchitectureDocs,
    claudeCreated: claude.created,
    claudeUpdated: claude.updated,
  };
}
