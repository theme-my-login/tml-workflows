<?php

/**
 * Require the version-floor headers bin/publish.php sends with each release.
 *
 * Run from the checkout root. Fails when any of the headers is missing or not a
 * version number, or when Requires PHP differs from phpcs's testVersion floor,
 * so lint always checks the code against the floor the store advertises. A repo
 * without an extension root file (the base plugin, the site) is skipped.
 */

require __DIR__ . '/lib/requirements.php';

$repo_slug   = basename( getcwd() );
$plugin_file = "{$repo_slug}.php";
$contents    = is_readable( $plugin_file ) ? (string) file_get_contents( $plugin_file ) : '';

if ( ! preg_match( '/protected\s+\$item_id\s*=\s*\d+;/', $contents ) ) {
	fwrite( STDOUT, "{$plugin_file} is not an extension root file; nothing to check.\n" );
	exit( 0 );
}

$errors = array();

foreach ( TML_RELEASE_REQUIREMENT_HEADERS as $header ) {
	$value = tml_release_read_header( $contents, $header );

	if ( '' === $value ) {
		$errors[] = array( $plugin_file, "Missing the \"{$header}\" header." );
	} elseif ( ! preg_match( '/^\d+(\.\d+){0,2}$/', $value ) ) {
		$errors[] = array( $plugin_file, "\"{$header}: {$value}\" is not a version number." );
	}
}

$requires_php = tml_release_read_header( $contents, 'Requires PHP' );
$phpcs        = is_readable( 'phpcs.xml.dist' ) ? (string) file_get_contents( 'phpcs.xml.dist' ) : '';
$phpcs_floor  = tml_release_phpcs_php_floor( $phpcs );

if ( '' === $phpcs_floor ) {
	$errors[] = array( 'phpcs.xml.dist', 'No testVersion with a lower bound, so lint cannot check the PHP floor.' );
} elseif ( '' !== $requires_php && $requires_php !== $phpcs_floor ) {
	$errors[] = array( 'phpcs.xml.dist', "testVersion {$phpcs_floor}- does not match \"Requires PHP: {$requires_php}\"." );
}

foreach ( $errors as list( $file, $message ) ) {
	fwrite( STDOUT, "::error file={$file}::{$message}\n" );
}

if ( $errors ) {
	exit( 1 );
}

fwrite( STDOUT, "Version-floor headers OK.\n" );
