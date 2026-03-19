#!/usr/bin/env bun
import * as path from 'path';
import { bootstrapProjectStack, loadStackRegistry } from './stack-support';

function parseArgs(argv: string[]) {
  const args = { projectRoot: process.cwd(), json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--project-root' && argv[i + 1]) {
      args.projectRoot = path.resolve(argv[++i]);
    } else if (arg === '--json') {
      args.json = true;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const result = bootstrapProjectStack(args.projectRoot, loadStackRegistry());

if (args.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`PROJECT_ROOT:${result.projectRoot}`);
  console.log(`DETECTED:${result.detected.join(',') || 'none'}`);
  console.log(`SELECTED:${result.selected.join(',') || 'none'}`);
  console.log(`MANIFEST:${result.manifestCreated ? 'CREATED' : 'EXISTING'}:${path.relative(result.projectRoot, result.manifestPath)}`);
  if (result.scaffoldedRuleFiles.length > 0) {
    console.log(`RULES_CREATED:${result.scaffoldedRuleFiles.join(',')}`);
  }
  if (result.scaffoldedArchitectureDocs.length > 0) {
    console.log(`DOCS_CREATED:${result.scaffoldedArchitectureDocs.join(',')}`);
  }
  console.log(`CLAUDE:${result.claudeUpdated ? 'UPDATED' : 'UNCHANGED'}`);
}
