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
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/**
 * Whether a repo's composer.json declares any real (non-platform) runtime
 * dependency under `require`, as opposed to `require-dev`-only tooling
 * (PHPUnit, WP core test scaffolding) that every other extension uses.
 * Read from composer.json rather than a separate config flag, since it's
 * already the authoritative record of what a repo ships at runtime.
 */
function hasRuntimeDependencies( dir ) {
	const composerJsonPath = join( dir, 'composer.json' );

	if ( ! existsSync( composerJsonPath ) ) {
		return false;
	}

	const { require: requireBlock = {} } = JSON.parse( readFileSync( composerJsonPath, 'utf8' ) );

	return Object.keys( requireBlock ).some(
		( name ) => ! /^(php|ext-|lib-|composer-plugin-api)/.test( name )
	);
}

const cwd = process.cwd();
const slug = basename( cwd );
const parentDir = dirname( cwd );
const zipPath = join( parentDir, `${ slug }.zip` );

if ( existsSync( zipPath ) ) {
	rmSync( zipPath );
}

const shipsVendor = hasRuntimeDependencies( cwd );

if ( shipsVendor ) {
	// Reinstall production-only, so dev/test packages that may already be
	// present in vendor/ (from an earlier `composer install`) don't ship too.
	execFileSync( 'composer', [ 'install', '--no-dev', '--optimize-autoloader', '--no-interaction' ], {
		cwd,
		stdio: 'inherit',
	} );
}

const excludes = [
	`${ slug }/node_modules/*`,
	`${ slug }/.git/*`,
	`${ slug }/.gitignore`,
	`${ slug }/.github/*`,
	`${ slug }/bin/*`,
	`${ slug }/tests/*`,
	`${ slug }/CONTRIBUTING.md`,
	`${ slug }/CLAUDE.md`,
	`${ slug }/release-please-config.json`,
	`${ slug }/.release-please-manifest.json`,
	`${ slug }/package.json`,
	`${ slug }/package-lock.json`,
	`${ slug }/composer.json`,
	`${ slug }/composer.lock`,
	`${ slug }/commitlint.config.cjs`,
	`${ slug }/*.dist`,
];

if ( ! shipsVendor ) {
	excludes.push( `${ slug }/vendor/*` );
}

execFileSync( 'zip', [
	'-rq',
	zipPath,
	slug,
	...excludes.flatMap( ( pattern ) => [ '-x', pattern ] ),
], { cwd: parentDir, stdio: 'inherit' } );
