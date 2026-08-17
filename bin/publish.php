<?php

/**
 * Compute this release's changelog bullets and publish it to EDD via the WP
 * release endpoint. Run from the extension's checkout root, after the zip
 * has already been built and uploaded to DO Spaces (see release-deploy.yml).
 *
 * Required env vars:
 *   TAG_NAME          e.g. "v1.2.0" - the tag release-please just created.
 *   VERSION            e.g. "1.2.0"
 *   FILE_NAME           e.g. "tml-favorites-1.2.0.zip"
 *   S3_PATH              e.g. "tml-extensions/extensions/favorites/tml-favorites-1.2.0.zip"
 *   CI_RELEASE_TOKEN, RELEASE_ENDPOINT_URL
 *   RELEASE_DRY_RUN      "true" (default) or "false" - anything but the
 *                         literal string "false" is dry-run.
 */

require __DIR__ . '/lib/commits.php';

/**
 * Read an env var, exiting if it's required and unset/empty.
 *
 * @param string $name     Env var name.
 * @param bool   $required Whether to exit(1) if unset/empty.
 * @return string|false
 */
function tml_release_env( $name, $required = true ) {
	$value = getenv( $name );

	if ( $required && ( false === $value || '' === $value ) ) {
		fwrite( STDERR, "Missing required env var: {$name}\n" );
		exit( 1 );
	}

	return $value;
}

$tag_name  = tml_release_env( 'TAG_NAME' );
$version   = tml_release_env( 'VERSION' );
$file_name = tml_release_env( 'FILE_NAME' );
$s3_path   = tml_release_env( 'S3_PATH' );
$dry_run   = 'false' !== getenv( 'RELEASE_DRY_RUN' ); // default true; must opt out explicitly.

$repo_slug   = basename( getcwd() );
$plugin_file = "{$repo_slug}.php";
$contents    = file_get_contents( $plugin_file );

if ( false === $contents || ! preg_match( '/protected\s+\$item_id\s*=\s*(\d+);/', $contents, $item_id_match ) ) {
	fwrite( STDERR, "Could not find a \$item_id property in {$plugin_file}\n" );
	exit( 1 );
}

$item_id = (int) $item_id_match[1];

// $tag_name isn't a real ref yet while the release is still a draft - HEAD
// (already the tagged commit) always resolves.
$previous_tag = trim( (string) shell_exec( 'git describe --tags --abbrev=0 HEAD^ 2>/dev/null' ) );
$range        = $previous_tag ? "{$previous_tag}..HEAD" : 'HEAD';

$parsed  = tml_release_parse_commits( $range );
$bullets = $parsed['bullets'];

if ( empty( $bullets ) ) {
	fwrite( STDERR, "No changelog-worthy commits found in {$range}; refusing to publish with an empty changelog.\n" );
	exit( 1 );
}

$payload = array(
	'item_id'   => $item_id,
	'version'   => $version,
	'bullets'   => $bullets,
	's3_path'   => $s3_path,
	'file_name' => $file_name,
	'dry_run'   => $dry_run,
);

$url   = tml_release_env( 'RELEASE_ENDPOINT_URL' );
$token = tml_release_env( 'CI_RELEASE_TOKEN' );

$ch = curl_init( $url );

curl_setopt_array(
	$ch,
	array(
		CURLOPT_CUSTOMREQUEST  => 'POST',
		CURLOPT_HTTPHEADER     => array(
			'Content-Type: application/json',
			'X-Release-Token: ' . $token,
		),
		CURLOPT_POSTFIELDS     => json_encode( $payload ),
		CURLOPT_RETURNTRANSFER => true,
	)
);

$response = curl_exec( $ch );
$status   = curl_getinfo( $ch, CURLINFO_HTTP_CODE );
$error    = curl_error( $ch );
curl_close( $ch );

if ( false === $response ) {
	fwrite( STDERR, "Release endpoint request failed: {$error}\n" );
	exit( 1 );
}

fwrite( STDOUT, "Release endpoint responded ({$status}): {$response}\n" );

if ( $status < 200 || $status >= 300 ) {
	exit( 1 );
}
