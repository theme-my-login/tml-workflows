#!/usr/bin/env node

/**
 * Build a tml-* repo's CSS/JS/image assets.
 *
 * Two modes, auto-detected:
 * - "in place" (no src/ dir) - assets/styles, assets/scripts, assets/images
 *   (and their admin/assets/ equivalents, if present) are compiled where
 *   they sit, each file independently: this is what a typical tml-*
 *   extension looks like today.
 * - "build directory" (src/ exists) - everything under src/ is copied to
 *   build/ (assets subtrees excluded, they're compiled in separately),
 *   and a build.config.json at the project root declares named bundles
 *   (multiple source files concatenated into one named output): this is
 *   the base plugin's WordPress.org packaging convention.
 *
 * SVG optimization (svgo) runs automatically wherever an images/
 * directory is present, in either mode. postcss-nested is always
 * included in the CSS pipeline - a no-op on CSS that doesn't use nested
 * syntax, so it's safe unconditionally.
 *
 * Run from the project root; `--watch` reruns on change for local
 * development, `--clean` removes build/ (build-directory mode only).
 */

import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

import postcss from 'postcss';
import postcssNested from 'postcss-nested';
import autoprefixer from 'autoprefixer';
import cssnano from 'cssnano';
import * as esbuild from 'esbuild';
import { optimize } from 'svgo';

const ROOT = process.cwd();
const BUILD_MODE = existsSync( join( ROOT, 'src' ) );
const SOURCE = BUILD_MODE ? join( ROOT, 'src' ) : ROOT;
const OUTPUT = BUILD_MODE ? join( ROOT, 'build' ) : ROOT;

const CONFIG_PATH = join( ROOT, 'build.config.json' );
const CONFIG = existsSync( CONFIG_PATH )
	? JSON.parse( await readFile( CONFIG_PATH, 'utf8' ) )
	: null;

const prefixCss = postcss( [ postcssNested, autoprefixer ] );
const minifyCss = postcss( [ cssnano ] );

async function minifyJsCode( code ) {
	return ( await esbuild.transform( code, { minify: true, loader: 'js' } ) ).code;
}

async function optimizeSvgFile( from ) {
	const svg = await readFile( from, 'utf8' );

	return optimize( svg, {
		path: from,
		plugins: [ { name: 'preset-default', params: { overrides: { cleanupIds: false } } } ],
	} ).data;
}

// --- "in place" mode: process each file independently, output alongside source. ---

async function inPlaceStyles( dir ) {
	if ( ! existsSync( dir ) ) return;

	const files = ( await readdir( dir ) ).filter( ( f ) => f.endsWith( '.css' ) && ! f.endsWith( '.min.css' ) );

	await Promise.all( files.map( async ( file ) => {
		const srcPath = join( dir, file );
		const css = await readFile( srcPath, 'utf8' );
		const prefixed = await prefixCss.process( css, { from: srcPath } );
		const minified = await minifyCss.process( prefixed.css, { from: undefined } );
		await writeFile( join( dir, file.replace( /\.css$/, '.min.css' ) ), minified.css );
	} ) );
}

async function inPlaceScripts( dir ) {
	if ( ! existsSync( dir ) ) return;

	const files = ( await readdir( dir ) ).filter( ( f ) => f.endsWith( '.js' ) && ! f.endsWith( '.min.js' ) );

	await Promise.all( files.map( async ( file ) => {
		const srcPath = join( dir, file );
		const js = await readFile( srcPath, 'utf8' );
		await writeFile( join( dir, file.replace( /\.js$/, '.min.js' ) ), await minifyJsCode( js ) );
	} ) );
}

async function inPlaceImages( dir ) {
	if ( ! existsSync( dir ) ) return;

	const entries = ( await readdir( dir, { withFileTypes: true } ) )
		.filter( ( e ) => e.isFile() && e.name.endsWith( '.svg' ) );

	await Promise.all( entries.map( async ( entry ) => {
		const from = join( dir, entry.name );
		await writeFile( from, await optimizeSvgFile( from ) );
	} ) );
}

function inPlaceSubtreeDirs() {
	return [ join( ROOT, 'assets' ), join( ROOT, 'admin/assets' ) ].filter( existsSync );
}

async function inPlaceBuild() {
	await Promise.all( inPlaceSubtreeDirs().map( ( dir ) => Promise.all( [
		inPlaceStyles( join( dir, 'styles' ) ),
		inPlaceScripts( join( dir, 'scripts' ) ),
		inPlaceImages( join( dir, 'images' ) ),
	] ) ) );
}

// --- "build directory" mode: copy src/ -> build/, compile assets per build.config.json. ---

async function clean() {
	await rm( OUTPUT, { recursive: true, force: true } );
}

// Copies everything under src/ except the asset subtrees declared in
// build.config.json (handled separately below).
async function copySource() {
	const assetDirs = ( CONFIG?.subtrees ?? [] ).map( ( st ) => st.dir );

	await cp( SOURCE, OUTPUT, {
		recursive: true,
		filter: ( source ) => {
			const rel = relative( SOURCE, source );
			return ! assetDirs.some( ( dir ) => rel === dir || rel.startsWith( `${ dir }${ sep }` ) );
		},
	} );
}

async function bundleStyles( srcDir, files, outDir, outName ) {
	const contents = await Promise.all( files.map( ( f ) => readFile( join( srcDir, f ), 'utf8' ) ) );
	const css = contents.join( '\n' );

	await mkdir( outDir, { recursive: true } );

	const prefixed = await prefixCss.process( css, { from: undefined } );
	await writeFile( join( outDir, `${ outName }.css` ), prefixed.css );

	const minified = await minifyCss.process( prefixed.css, { from: undefined } );
	await writeFile( join( outDir, `${ outName }.min.css` ), minified.css );
}

async function bundleScripts( srcDir, outDir, outName ) {
	let files;

	try {
		files = ( await readdir( srcDir ) ).filter( ( f ) => f.endsWith( '.js' ) ).sort();
	} catch ( err ) {
		if ( err.code === 'ENOENT' ) return;
		throw err;
	}

	const contents = await Promise.all( files.map( ( f ) => readFile( join( srcDir, f ), 'utf8' ) ) );
	const concatenated = contents.join( '\n' );

	await mkdir( outDir, { recursive: true } );
	await writeFile( join( outDir, `${ outName }.js` ), concatenated );
	await writeFile( join( outDir, `${ outName }.min.js` ), await minifyJsCode( concatenated ) );
}

// Optimizes SVGs with svgo; other image types are copied through as-is.
async function bundleImages( srcDir, outDir ) {
	let entries;

	try {
		entries = await readdir( srcDir, { recursive: true, withFileTypes: true } );
	} catch ( err ) {
		if ( err.code === 'ENOENT' ) return;
		throw err;
	}

	await Promise.all( entries.filter( ( e ) => e.isFile() ).map( async ( entry ) => {
		const from = join( entry.parentPath, entry.name );
		const rel = relative( srcDir, from );
		const to = join( outDir, rel );

		await mkdir( dirname( to ), { recursive: true } );

		if ( entry.name.endsWith( '.svg' ) ) {
			await writeFile( to, await optimizeSvgFile( from ) );
		} else {
			await cp( from, to );
		}
	} ) );
}

async function buildDirectorySubtree( subtree ) {
	const srcDir = join( SOURCE, subtree.dir );
	const outDir = join( OUTPUT, subtree.dir );

	const tasks = [ bundleImages( join( srcDir, 'images' ), join( outDir, 'images' ) ) ];

	if ( subtree.styles ) {
		tasks.push( ...Object.entries( subtree.styles ).map( ( [ outName, files ] ) =>
			bundleStyles( join( srcDir, 'styles' ), files, join( outDir, 'styles' ), outName ) ) );
	}

	if ( subtree.scripts ) {
		tasks.push( bundleScripts( join( srcDir, 'scripts' ), join( outDir, 'scripts' ), subtree.scripts ) );
	}

	await Promise.all( tasks );
}

async function buildDirectoryBuild() {
	await clean();
	await copySource();
	await Promise.all( ( CONFIG?.subtrees ?? [] ).map( buildDirectorySubtree ) );
}

async function build() {
	if ( BUILD_MODE ) {
		await buildDirectoryBuild();
	} else {
		await inPlaceBuild();
	}
}

async function watch() {
	const { default: chokidar } = await import( 'chokidar' );

	await build();

	const run = ( label, task ) => () => {
		task().catch( ( err ) => console.error( `${ label } failed:`, err ) );
	};

	if ( BUILD_MODE ) {
		for ( const subtree of CONFIG?.subtrees ?? [] ) {
			const srcDir = join( SOURCE, subtree.dir );
			chokidar.watch( srcDir, { ignoreInitial: true } )
				.on( 'all', run( subtree.dir, () => buildDirectorySubtree( subtree ) ) );
		}

		// Non-asset source changes just get re-copied individually.
		const assetDirs = ( CONFIG?.subtrees ?? [] ).map( ( st ) => join( SOURCE, st.dir ) );
		chokidar.watch( SOURCE, {
			ignored: ( path ) => assetDirs.some( ( dir ) => path === dir || path.startsWith( `${ dir }${ sep }` ) ),
			ignoreInitial: true,
		} ).on( 'all', async ( event, file ) => {
			if ( event !== 'add' && event !== 'change' ) return;
			const rel = relative( SOURCE, file );
			console.log( `Copying '${ rel }'` );
			await mkdir( dirname( join( OUTPUT, rel ) ), { recursive: true } );
			await cp( file, join( OUTPUT, rel ) );
		} );
	} else {
		for ( const dir of inPlaceSubtreeDirs() ) {
			chokidar.watch( dir, { ignoreInitial: true } ).on( 'all', run( dir, inPlaceBuild ) );
		}
	}

	console.log( 'Watching for changes...' );
}

const args = process.argv.slice( 2 );

if ( args.includes( '--clean' ) ) {
	await clean();
} else if ( args.includes( '--watch' ) ) {
	await watch();
} else {
	await build();
}
