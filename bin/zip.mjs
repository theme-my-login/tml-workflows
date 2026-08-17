#!/usr/bin/env node

/**
 * Package a tml-* extension into a zip one directory above the checkout.
 *
 * The internal folder is named after the checkout directory, which on a
 * GitHub Actions runner is always the repo slug (GITHUB_WORKSPACE's own
 * basename), matching the `<repo-slug>.php` convention the rest of this
 * pipeline relies on.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const cwd = process.cwd();
const slug = basename( cwd );
const parentDir = dirname( cwd );
const zipPath = join( parentDir, `${ slug }.zip` );

if ( existsSync( zipPath ) ) {
	rmSync( zipPath );
}

execFileSync( 'zip', [
	'-rq',
	zipPath,
	slug,
	'-x', `${ slug }/node_modules/*`,
	'-x', `${ slug }/.git/*`,
	'-x', `${ slug }/.gitignore`,
	'-x', `${ slug }/.github/*`,
	'-x', `${ slug }/.tml-workflows/*`,
	'-x', `${ slug }/CONTRIBUTING.md`,
	'-x', `${ slug }/release-please-config.json`,
	'-x', `${ slug }/.release-please-manifest.json`,
], { cwd: parentDir, stdio: 'inherit' } );
