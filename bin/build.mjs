#!/usr/bin/env node

/**
 * Build a tml-* extension's CSS/JS assets in place.
 *
 * Every non-minified file in assets/styles and assets/scripts gets
 * prefixed/minified (CSS) or minified (JS) into a sibling .min file,
 * independently rather than concatenated. Either directory is skipped if
 * the extension doesn't have it - most extensions only need one, some
 * need neither. Run from the extension's checkout root; `--watch` reruns
 * on change for local development.
 */

import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import postcss from 'postcss';
import autoprefixer from 'autoprefixer';
import cssnano from 'cssnano';
import * as esbuild from 'esbuild';

const ROOT = process.cwd();
const STYLES_DIR = join( ROOT, 'assets/styles' );
const SCRIPTS_DIR = join( ROOT, 'assets/scripts' );

const prefix = postcss( [ autoprefixer ] );
const minify = postcss( [ cssnano ] );

async function styles() {
	if ( ! existsSync( STYLES_DIR ) ) return;

	const files = ( await readdir( STYLES_DIR ) )
		.filter( ( f ) => f.endsWith( '.css' ) && ! f.endsWith( '.min.css' ) );

	await Promise.all( files.map( async ( file ) => {
		const srcPath = join( STYLES_DIR, file );
		const css = await readFile( srcPath, 'utf8' );

		const prefixed = await prefix.process( css, { from: srcPath } );
		const minified = await minify.process( prefixed.css, { from: undefined } );

		const outPath = join( STYLES_DIR, file.replace( /\.css$/, '.min.css' ) );
		await writeFile( outPath, minified.css );
	} ) );
}

async function scripts() {
	if ( ! existsSync( SCRIPTS_DIR ) ) return;

	const files = ( await readdir( SCRIPTS_DIR ) )
		.filter( ( f ) => f.endsWith( '.js' ) && ! f.endsWith( '.min.js' ) );

	await Promise.all( files.map( async ( file ) => {
		const srcPath = join( SCRIPTS_DIR, file );
		const js = await readFile( srcPath, 'utf8' );

		const minified = await esbuild.transform( js, { minify: true, loader: 'js' } );

		const outPath = join( SCRIPTS_DIR, file.replace( /\.js$/, '.min.js' ) );
		await writeFile( outPath, minified.code );
	} ) );
}

async function build() {
	await Promise.all( [ styles(), scripts() ] );
}

async function watch() {
	const { default: chokidar } = await import( 'chokidar' );

	await build();

	const run = ( label, task ) => () => {
		task().catch( ( err ) => console.error( `${ label } failed:`, err ) );
	};

	if ( existsSync( STYLES_DIR ) ) {
		chokidar.watch( STYLES_DIR, { ignoreInitial: true } ).on( 'all', run( 'styles', styles ) );
	}

	if ( existsSync( SCRIPTS_DIR ) ) {
		chokidar.watch( SCRIPTS_DIR, { ignoreInitial: true } ).on( 'all', run( 'scripts', scripts ) );
	}

	console.log( 'Watching for changes...' );
}

const args = process.argv.slice( 2 );

if ( args.includes( '--watch' ) ) {
	await watch();
} else {
	await build();
}
