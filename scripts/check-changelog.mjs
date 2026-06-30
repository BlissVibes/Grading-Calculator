// Build guard: the changelog must be updated for every versioned release.
//
// Fails the build (and therefore the Vercel deploy) unless the newest entry in
// src/changelog.ts matches the version in package.json. This makes it
// impossible to push a versioned merge to the site without a changelog entry.

import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
const changelog = readFileSync(new URL('../src/changelog.ts', import.meta.url), 'utf-8');

// First `version: '...'` in the file = newest release entry (newest-first list).
const match = changelog.match(/version:\s*['"]([^'"]+)['"]/);
const newest = match ? match[1] : null;

if (newest !== pkg.version) {
  console.error('\n✗ Changelog is out of date.');
  console.error(`    package.json version : ${pkg.version}`);
  console.error(`    newest changelog entry: ${newest ?? '(none found)'}`);
  console.error(`\n  Add a CHANGELOG entry with version '${pkg.version}' at the top of`);
  console.error('  src/changelog.ts before releasing.\n');
  process.exit(1);
}

console.log(`✓ Changelog up to date (v${pkg.version}).`);
