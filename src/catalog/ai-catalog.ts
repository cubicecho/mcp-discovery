/**
 * The AI Catalog: a host's list of AI artifacts, each named by media type, which is how a client finds its Server Cards.
 *
 * Follows the Agent-Card/ai-catalog specification, `specVersion` 1.x. Only what MCP discovery needs is
 * typed; signatures, trust manifests and extensions pass through untouched.
 */

import { z } from 'zod';
import { parseServerCard, type ServerCard } from '../card/server-card.ts';
import { SERVER_CARD_MEDIA_TYPE } from '../core/consts.ts';
import { parseDocument } from '../core/parse.ts';

/** The `specVersion` this package writes. */
export const AI_CATALOG_SPEC_VERSION = '1.0';

/** The `specVersion` major this package reads; any minor is accepted. */
const SUPPORTED_MAJOR = 1;

/** `Major.Minor`, both non-negative integers. */
const SPEC_VERSION_PATTERN = /^(\d+)\.(\d+)$/;

/** The link relation that points at a site's AI Catalog. */
const AI_CATALOG_LINK_REL = 'ai-catalog';

/** The `urn:air` identifier's prefix. */
const AIR_URN_PREFIX = 'urn:air';

/** The `urn:air` namespace for MCP servers. */
const AIR_MCP_NAMESPACE = 'mcp';

/**
 * Whether a `specVersion` has the major version this package reads.
 *
 * @param specVersion - A `Major.Minor` string.
 * @returns true for any 1.x.
 */
function hasSupportedMajor(specVersion: string): boolean {
  const [, major] = SPEC_VERSION_PATTERN.exec(specVersion) ?? [];
  return Number(major) === SUPPORTED_MAJOR;
}

/** The operator of a catalog. */
export const hostInfoSchema = z.looseObject({
  displayName: z.string().min(1),
  /** A verifiable id for the host: a DID or a domain. */
  identifier: z.string().optional(),
  documentationUrl: z.string().optional(),
  logoUrl: z.string().optional(),
});

/** One artifact in a catalog, carried by `url` or inline as `data`, never both. */
export const catalogEntrySchema = z
  .looseObject({
    /** Unique within the catalog; `urn:air:{publisher}:{namespace}:{name}` recommended. */
    identifier: z.string().min(1),
    /** The artifact's media type. */
    type: z.string().min(1),
    /** Where the artifact is fetched from. */
    url: z.string().optional(),
    /** The artifact inline. */
    data: z.unknown().optional(),
    /** Overrides the artifact's own name; leave unset when the artifact has one. */
    displayName: z.string().optional(),
    /** Overrides the artifact's own description; leave unset when the artifact has one. */
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
    version: z.string().optional(),
    /** RFC 3339 timestamp of the entry's last change. */
    updatedAt: z.string().optional(),
  })
  .refine((entry) => (entry.url === undefined) !== (entry.data === undefined), {
    message: 'An entry carries exactly one of `url` or `data`',
  });

/** An AI Catalog. Unknown fields are kept, as the spec asks of readers. */
export const aiCatalogSchema = z.looseObject({
  specVersion: z
    .string()
    .regex(SPEC_VERSION_PATTERN, 'Must be Major.Minor, e.g. 1.0')
    .refine(hasSupportedMajor, `Only specVersion ${SUPPORTED_MAJOR}.x is supported`),
  entries: z.array(catalogEntrySchema),
  host: hostInfoSchema.optional(),
});

/** The operator of a catalog. */
export type HostInfo = z.infer<typeof hostInfoSchema>;
/** One artifact in a catalog. */
export type CatalogEntry = z.infer<typeof catalogEntrySchema>;
/** An AI Catalog. */
export type AiCatalog = z.infer<typeof aiCatalogSchema>;

/** What `createAiCatalog` takes. */
export interface AiCatalogFields {
  /** The artifacts; may be empty. */
  entries: CatalogEntry[];
  /** Who runs the catalog. */
  host?: HostInfo;
}

/** A catalog entry that holds a Server Card, by URL or inline. */
export type ServerCardEntry = CatalogEntry & { type: typeof SERVER_CARD_MEDIA_TYPE };

/**
 * Validates a document as an AI Catalog.
 *
 * @param value - The parsed JSON.
 * @param source - Where it came from, for the error message.
 * @returns The catalog.
 * @throws {@link InvalidDocumentError} If it is not a valid 1.x catalog.
 */
export function parseAiCatalog(value: unknown, source: string): AiCatalog {
  return parseDocument(aiCatalogSchema, value, 'AI Catalog', source);
}

/**
 * Builds an AI Catalog, adding its `specVersion` and validating the result.
 *
 * @param fields - The entries, and optionally the host.
 * @returns The catalog.
 * @throws {@link InvalidDocumentError} If an entry is malformed.
 */
export function createAiCatalog(fields: AiCatalogFields): AiCatalog {
  return parseAiCatalog({ specVersion: AI_CATALOG_SPEC_VERSION, ...fields }, 'AI Catalog');
}

/**
 * An entry that points at a Server Card by URL.
 *
 * @param identifier - The entry's id; see {@link airIdentifier}.
 * @param url - Where the card is served, usually {@link serverCardUrl} of the endpoint.
 * @returns The entry.
 */
export function serverCardEntry(identifier: string, url: string): ServerCardEntry {
  return { identifier, type: SERVER_CARD_MEDIA_TYPE, url };
}

/**
 * An entry that carries a Server Card inline.
 *
 * @param identifier - The entry's id; see {@link airIdentifier}.
 * @param card - The card itself.
 * @returns The entry.
 */
export function inlineServerCardEntry(identifier: string, card: ServerCard): ServerCardEntry {
  return { identifier, type: SERVER_CARD_MEDIA_TYPE, data: card };
}

/**
 * A `urn:air:{publisher}:mcp:{name}` identifier for an MCP server.
 *
 * @param publisher - A domain the publisher controls, e.g. `example.com`.
 * @param name - The server's stable name under that publisher.
 * @returns E.g. `urn:air:example.com:mcp:weather`.
 * @throws If either part is empty or contains a colon, which would shift the URN's segments.
 */
export function airIdentifier(publisher: string, name: string): string {
  const isMalformed = [publisher, name].some((part) => part === '' || part.includes(':'));
  if (isMalformed) {
    throw new Error(`A urn:air publisher and name are non-empty and colon-free; got "${publisher}" and "${name}"`);
  }
  return `${AIR_URN_PREFIX}:${publisher}:${AIR_MCP_NAMESPACE}:${name}`;
}

/**
 * The entries in a catalog that hold Server Cards; every other artifact type is left out.
 *
 * @param catalog - A validated catalog.
 * @returns The card entries, in catalog order.
 */
export function serverCardEntries(catalog: AiCatalog): ServerCardEntry[] {
  return catalog.entries.filter((entry): entry is ServerCardEntry => entry.type === SERVER_CARD_MEDIA_TYPE);
}

/**
 * Validates a card entry's inline card.
 *
 * @param entry - An entry with `data`.
 * @param source - Where the catalog came from, for the error message.
 * @returns The card.
 * @throws {@link InvalidDocumentError} If `data` is not a valid card.
 */
export function parseInlineServerCard(entry: ServerCardEntry, source: string): ServerCard {
  return parseServerCard(entry.data, `${source} (entry ${entry.identifier})`);
}

/**
 * A `Link` header value that points at an AI Catalog, for a site's other responses to carry.
 *
 * @param catalogUrl - The catalog's URL, absolute or relative to the response.
 * @returns E.g. `</.well-known/ai-catalog.json>; rel="ai-catalog"`.
 */
export function aiCatalogLinkHeader(catalogUrl: string): string {
  return `<${catalogUrl}>; rel="${AI_CATALOG_LINK_REL}"`;
}
