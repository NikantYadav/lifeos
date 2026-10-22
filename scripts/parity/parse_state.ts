// Reads a JSON state from stdin, runs the server's parseState on it, prints the result as JSON.
// Usage: npx -y tsx --tsconfig tsconfig.json scripts/parity/parse_state.ts < input.json
import { readFileSync } from 'node:fs';
import { parseState } from '../../src/lib/validate';

const input = JSON.parse(readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(parseState(input)));
