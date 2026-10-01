<?php

/**
 * Version-requirement extraction, shared by every tml-* extension's deploy job.
 *
 * Floors come from the root plugin file's headers: WP's own `Requires at least`
 * and `Requires PHP`, plus `Requires TML`.
 */

// Endpoint platform key => plugin header.
const TML_RELEASE_REQUIREMENT_HEADERS = array(
	'wp'  => 'Requires at least',
	'tml' => 'Requires TML',
	'php' => 'Requires PHP',
);

/**
 * Read a plugin header value the way WP's get_file_data() does.
 *
 * @param string $contents Plugin file contents.
 * @param string $name     Header name, e.g. "Requires PHP".
 * @return string Empty if the header is absent.
 */
function tml_release_read_header( $contents, $name ) {
	if ( ! preg_match( '/^(?:[ \t]*<\?php)?[ \t\/*#@]*' . preg_quote( $name, '/' ) . ':(.*)$/mi', $contents, $match ) ) {
		return '';
	}

	return trim( preg_replace( '/\s*(?:\*\/|\?>).*/', '', $match[1] ) );
}

/**
 * Read the lower bound of phpcs's PHPCompatibility testVersion.
 *
 * @param string $phpcs phpcs.xml.dist contents.
 * @return string Empty if no testVersion with a lower bound is configured.
 */
function tml_release_phpcs_php_floor( $phpcs ) {
	if ( ! preg_match( '/name="testVersion"\s+value="(\d+(?:\.\d+)*)-/', $phpcs, $match ) ) {
		return '';
	}

	return $match[1];
}

/**
 * Collect the version floors to publish alongside a release.
 *
 * A malformed or missing floor is left out rather than failing the release, so
 * the store keeps whatever it already has.
 *
 * @param string $plugin_contents Root plugin file contents.
 * @return array {
 *     @type array<string, string> $requires Platform key => minimum version.
 *     @type string[]              $warnings Problems worth surfacing in the job log.
 * }
 */
function tml_release_requirements( $plugin_contents ) {
	$requires = array();
	$warnings = array();

	foreach ( TML_RELEASE_REQUIREMENT_HEADERS as $platform => $header ) {
		$value = tml_release_read_header( $plugin_contents, $header );

		if ( '' === $value ) {
			$warnings[] = "No \"{$header}\" header; the store keeps its current value.";
		} elseif ( ! preg_match( '/^\d+(\.\d+){0,2}$/', $value ) ) {
			$warnings[] = "\"{$header}: {$value}\" is not a version number; ignoring it.";
		} else {
			$requires[ $platform ] = $value;
		}
	}

	return array(
		'requires' => $requires,
		'warnings' => $warnings,
	);
}
