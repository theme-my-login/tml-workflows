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
	'-x', `${ slug }/vendor/*`,
	'-x', `${ slug }/.git/*`,
	'-x', `${ slug }/.gitignore`,
	'-x', `${ slug }/.github/*`,
	'-x', `${ slug }/bin/*`,
	'-x', `${ slug }/tests/*`,
	'-x', `${ slug }/CONTRIBUTING.md`,
	'-x', `${ slug }/CLAUDE.md`,
	'-x', `${ slug }/release-please-config.json`,
	'-x', `${ slug }/.release-please-manifest.json`,
	'-x', `${ slug }/package.json`,
	'-x', `${ slug }/package-lock.json`,
	'-x', `${ slug }/composer.json`,
	'-x', `${ slug }/composer.lock`,
	'-x', `${ slug }/commitlint.config.cjs`,
	'-x', `${ slug }/*.dist`,
], { cwd: parentDir, stdio: 'inherit' } );
