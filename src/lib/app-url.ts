/**
 * Where this deployment lives, for links in outbound email.
 *
 * Three call sites each had their own copy of this, and each fell back to the
 * author's own production domain when NEXT_PUBLIC_APP_URL was unset. That is
 * not a cosmetic leak: anyone else deploying this and missing one environment
 * variable would send project invitations and blocker alerts whose links point
 * at a stranger's install — recipients click through to someone else's data,
 * and the operator who sent them never sees an error, only a warning in a log
 * nobody reads.
 *
 * The fallback is now localhost. A wrong-but-obviously-local link is a bug
 * report; a wrong-but-plausible-remote link is a silent misdirection.
 */

const DEFAULT_APP_URL = 'http://localhost:3000';

let warned = false;

export function appUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');

  if (!warned) {
    warned = true;
    console.warn(
      `[app-url] NEXT_PUBLIC_APP_URL is not set — email links will use ${DEFAULT_APP_URL}, ` +
        'which is almost certainly wrong for anyone receiving them.',
    );
  }
  return DEFAULT_APP_URL;
}
