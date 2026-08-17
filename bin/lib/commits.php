<?php

/**
 * Conventional Commits parsing, shared by every tml-* extension's deploy job.
 *
 * Same rules as theme-my-login-7's bin/draft-changelog.php (excluded types,
 * Release-Note: trailer override) - version bumping itself is release-please's
 * job on GitHub, so only the bullets this returns are used, but the bump/
 * release_as classification is kept intact rather than stripped out, in case
 * a future caller needs it.
 */

// Types that never surface in the user-facing changelog or affect versioning.
const TML_RELEASE_EXCLUDED_TYPES = array( 'chore', 'ci', 'docs', 'build', 'test', 'refactor' );

/**
 * Parse commits in a git range into changelog bullets and a semver bump.
 *
 * @param string $range git revision range, e.g. "v1.0.2..v1.0.3" or "v1.0.3" if no prior tag.
 * @return array {
 *     @type string[]     $bullets    Changelog bullet text, newest-commit-first.
 *     @type string|null  $bump       'major'|'minor'|'patch'|null (null = nothing releasable).
 *     @type string|null  $release_as Explicit version override from a Release-As: footer, if present.
 * }
 */
function tml_release_parse_commits( $range ) {
	$record_sep = "\x1e";
	$field_sep  = "\x1f";

	$log = (string) shell_exec(
		'git log --no-merges ' . escapeshellarg( $range ) . " --pretty=format:%s{$field_sep}%b{$record_sep} 2>/dev/null"
	);

	$records = array_filter(
		array_map( 'trim', explode( $record_sep, $log ) ),
		static function ( $record ) {
			return '' !== $record;
		}
	);

	$bullets    = array();
	$bump       = null;
	$release_as = null;

	$bump_rank = array(
		'patch' => 1,
		'minor' => 2,
		'major' => 3,
	);

	foreach ( $records as $record ) {
		list( $subject, $body ) = array_pad( explode( $field_sep, $record, 2 ), 2, '' );

		if ( ! preg_match( '/^(\w+)(\(([^)]*)\))?(!)?:\s*(.+)$/', $subject, $matches ) ) {
			continue; // Not a Conventional Commits subject, skip it.
		}

		$type        = strtolower( $matches[1] );
		$is_breaking = ( '!' === ( $matches[4] ?? '' ) ) || (bool) preg_match( '/^BREAKING CHANGE:/mi', $body );

		if ( preg_match( '/^Release-As:\s*([0-9]+\.[0-9]+\.[0-9]+)\s*$/mi', $body, $release_as_match ) ) {
			$release_as = trim( $release_as_match[1] );
		}

		if ( $is_breaking ) {
			$commit_bump = 'major';
		} elseif ( 'feat' === $type ) {
			$commit_bump = 'minor';
		} elseif ( in_array( $type, array( 'fix', 'perf' ), true ) ) {
			$commit_bump = 'patch';
		} else {
			$commit_bump = null;
		}

		if ( null !== $commit_bump && ( null === $bump || $bump_rank[ $commit_bump ] > $bump_rank[ $bump ] ) ) {
			$bump = $commit_bump;
		}

		if ( in_array( $type, TML_RELEASE_EXCLUDED_TYPES, true ) ) {
			continue; // Excluded from the changelog, but still counted for versioning above.
		}

		// A `Release-Note:` trailer overrides the subject for user-facing wording.
		if ( preg_match( '/^Release-Note:\s*(.+)$/mi', $body, $note ) ) {
			$text = trim( $note[1] );
		} else {
			$text = trim( $matches[5] );
		}

		$bullets[] = ucfirst( $text );
	}

	return array(
		'bullets'    => $bullets,
		'bump'       => $bump,
		'release_as' => $release_as,
	);
}
