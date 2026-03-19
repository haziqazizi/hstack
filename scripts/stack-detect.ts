#!/usr/bin/env bun
import * as path from 'path';
import { detectStacks, loadStackRegistry } from './stack-support';

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
const stacks = detectStacks(args.projectRoot, loadStackRegistry());

if (args.json) {
  console.log(JSON.stringify({ projectRoot: args.projectRoot, stacks }, null, 2));
} else if (stacks.length === 0) {
  console.log('STACKS:none');
} else {
  for (const stack of stacks) {
    console.log(`STACK:${stack.name}:${stack.role}`);
  }
}
