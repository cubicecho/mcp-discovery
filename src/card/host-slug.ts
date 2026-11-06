/**
 * Turning a machine's hostname into the part of a Server Card's name, or a `urn:air` publisher, that tells two hosts apart.
 */

/** The longest DNS label, in characters; a slug is one label. */
const DNS_LABEL_MAX_LENGTH = 63;

/** What `hostSlug` answers when a hostname has nothing usable in it. */
const DEFAULT_FALLBACK = 'host';

/**
 * A hostname's first label as a slug: lowercase letters, digits and dashes, as a card name's namespace allows.
 *
 * @param hostname - E.g. `NAS`, `my_box.lan`; usually `os.hostname()`.
 * @param [fallback] - Answered when nothing usable is left, e.g. `router`.
 * @returns E.g. `nas`, `my-box`; at most 63 characters, with no leading or trailing dash.
 */
export function hostSlug(hostname: string, fallback = DEFAULT_FALLBACK): string {
  const [label = ''] = hostname.toLowerCase().split('.');
  const slug = label
    .replace(/[^a-z0-9-]+/g, '-')
    .slice(0, DNS_LABEL_MAX_LENGTH)
    .replace(/^-+|-+$/g, '');
  return slug === '' ? fallback : slug;
}
