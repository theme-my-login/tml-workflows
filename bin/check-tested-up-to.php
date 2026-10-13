<?php

/**
 * Require a readme's "Tested up to" to match the WordPress the suite runs on.
 *
 * Run from the checkout root. Compares major.minor against the
 * roots/wordpress-no-content version in composer.lock, so the claim and the
 * test target can't be bumped apart. A repo whose readme declares no
 * "Tested up to" is skipped.
 */

require __DIR__ . '/lib/requirements.php';

$readme = '';
foreach ( array( 'readme.txt', 'src/readme.txt' ) as $candidate ) {
	if ( is_readable( $candidate ) ) {
		$readme = $candidate;
		break;
	}
}

$tested = '' === $readme ? '' : tml_release_read_header( (string) file_get_contents( $readme ), 'Tested up to' );

if ( '' === $tested ) {
	fwrite( STDOUT, "No \"Tested up to\" header; nothing to check.\n" );
	exit( 0 );
}

$lock      = is_readable( 'composer.lock' ) ? json_decode( (string) file_get_contents( 'composer.lock' ), true ) : null;
$packages  = is_array( $lock ) ? array_merge( $lock['packages'] ?? array(), $lock['packages-dev'] ?? array() ) : array();
$wordpress = '';
foreach ( $packages as $package ) {
	if ( 'roots/wordpress-no-content' === ( $package['name'] ?? '' ) ) {
		$wordpress = (string) $package['version'];
	}
}

if ( '' === $wordpress ) {
	fwrite( STDOUT, "::error file=composer.lock::No locked roots/wordpress-no-content to check \"Tested up to: {$tested}\" against.\n" );
	exit( 1 );
}

$minor = static function ( $version ) {
	return preg_match( '/^\d+\.\d+/', $version, $match ) ? $match[0] : $version;
};

if ( $minor( $tested ) !== $minor( $wordpress ) ) {
	fwrite( STDOUT, "::error file={$readme}::\"Tested up to: {$tested}\" does not match the WordPress {$wordpress} the suite runs on (composer.lock).\n" );
	exit( 1 );
}

fwrite( STDOUT, "\"Tested up to: {$tested}\" matches the locked WordPress {$wordpress}.\n" );
