/**
 * The MCP Server Card: a static, public description of one remote MCP server, read before connecting.
 *
 * Mirrors `schema.ts` in modelcontextprotocol/ext-server-card (SEP-2127). A card names
 * the server and says where and how to connect; it never lists tools, resources or prompts.
 */

import { z } from 'zod';
import { parseDocument } from '../core/parse.ts';

/** The `$schema` every v1 Server Card carries. */
export const SERVER_CARD_SCHEMA_URL = 'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json';

/** What is appended to a streamable-HTTP URL to reach its card, the location MCP reserves. */
export const SERVER_CARD_PATH = '/server-card';

/** The streamable-HTTP transport. */
export const TRANSPORT_STREAMABLE_HTTP = 'streamable-http' as const;

/** The legacy HTTP+SSE transport. */
export const TRANSPORT_SSE = 'sse' as const;

const NAME_MIN_LENGTH = 3;
const NAME_MAX_LENGTH = 200;
const VERSION_MAX_LENGTH = 255;
const TEXT_MAX_LENGTH = 100;

/** Reverse-DNS namespace, one slash, then the server's own name: `com.example/weather`. */
const NAME_PATTERN = /^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/;

/** An http(s) URL, or one that starts with a `{variable}`. */
const REMOTE_URL_PATTERN = /^(https?:\/\/[^\s]+|\{[a-zA-Z_][a-zA-Z0-9_]*\}[^\s]*)$/;

/** A version range rather than a version: `^1.2.3`, `~1`, `>=1`, `1.x`, `1.*`. */
const VERSION_RANGE_PATTERN = /^[\^~<>=]|(^|\.)[xX*](\.|$)/;

/** A user-supplied or pre-set value for a remote's URL variable or header. */
export const inputSchema = z.looseObject({
  /** Shown to the user when asking for the value. */
  description: z.string().optional(),
  isRequired: z.boolean().optional(),
  /** The value is a secret (a token, a password) and is handled as one. */
  isSecret: z.boolean().optional(),
  format: z.enum(['string', 'number', 'boolean', 'filepath']).optional(),
  default: z.string().optional(),
  placeholder: z.string().optional(),
  /** A fixed value the user does not configure; `{variables}` in it are substituted. */
  value: z.string().optional(),
  /** The only values allowed. */
  choices: z.array(z.string()).optional(),
});

/** A named input: an HTTP header a client sends to the remote. */
export const keyValueInputSchema = inputSchema.extend({
  /** The header name. */
  name: z.string().min(1),
  /** Variables referenced as `{name}` in `value`. */
  variables: z.record(z.string(), inputSchema).optional(),
});

/** One HTTP endpoint the server can be reached at. */
export const remoteSchema = z.looseObject({
  type: z.enum([TRANSPORT_STREAMABLE_HTTP, TRANSPORT_SSE]),
  /** The endpoint, possibly templated with `{variables}`. */
  url: z.string().regex(REMOTE_URL_PATTERN, 'Must start with http://, https:// or a {variable}'),
  headers: z.array(keyValueInputSchema).optional(),
  /** Values for the `{variables}` in `url`. */
  variables: z.record(z.string(), inputSchema).optional(),
  /** MCP protocol versions the endpoint speaks, e.g. `2025-11-25`. */
  supportedProtocolVersions: z.array(z.string()).optional(),
});

/** Where the server's source code lives. */
export const repositorySchema = z.looseObject({
  url: z.url(),
  /** The hosting service, e.g. `github`. */
  source: z.string(),
  /** The server's folder inside a monorepo. */
  subfolder: z.string().optional(),
  /** The forge's own id for the repository. */
  id: z.string().optional(),
});

/** An icon a client may show for the server. */
export const iconSchema = z.looseObject({
  /** An http(s) or `data:` URL. */
  src: z.url(),
  mimeType: z.string().optional(),
  /** `48x48`-style sizes, or `any` for a scalable image. */
  sizes: z.array(z.string()).optional(),
  theme: z.enum(['light', 'dark']).optional(),
});

/** An MCP Server Card. Unknown fields are kept, as the spec asks of readers. */
export const serverCardSchema = z.looseObject({
  $schema: z.literal(SERVER_CARD_SCHEMA_URL),
  /** Reverse-DNS name with one slash: `com.example/weather`. */
  name: z
    .string()
    .min(NAME_MIN_LENGTH)
    .max(NAME_MAX_LENGTH)
    .regex(NAME_PATTERN, 'Must be reverse-DNS with one slash, e.g. com.example/weather'),
  /** The server's version; semver recommended, ranges rejected. */
  version: z
    .string()
    .min(1)
    .max(VERSION_MAX_LENGTH)
    .refine((version) => VERSION_RANGE_PATTERN.test(version) === false, 'Must be a version, not a range'),
  description: z.string().min(1).max(TEXT_MAX_LENGTH),
  /** Display name. */
  title: z.string().min(1).max(TEXT_MAX_LENGTH).optional(),
  websiteUrl: z.url().optional(),
  repository: repositorySchema.optional(),
  icons: z.array(iconSchema).optional(),
  remotes: z.array(remoteSchema).optional(),
  /** Vendor metadata under reverse-DNS keys. Never capabilities. */
  _meta: z.record(z.string(), z.unknown()).optional(),
});

/** A user-supplied or pre-set value for a remote's URL variable or header. */
export type Input = z.infer<typeof inputSchema>;
/** A named input: an HTTP header a client sends to the remote. */
export type KeyValueInput = z.infer<typeof keyValueInputSchema>;
/** One HTTP endpoint the server can be reached at. */
export type Remote = z.infer<typeof remoteSchema>;
/** Where the server's source code lives. */
export type Repository = z.infer<typeof repositorySchema>;
/** An icon a client may show for the server. */
export type Icon = z.infer<typeof iconSchema>;
/** An MCP Server Card. */
export type ServerCard = z.infer<typeof serverCardSchema>;
/** What `createServerCard` takes: a card without its `$schema`. */
export type ServerCardFields = Omit<z.input<typeof serverCardSchema>, '$schema'>;

/**
 * Validates a document as a Server Card.
 *
 * @param value - The parsed JSON.
 * @param source - Where it came from, for the error message.
 * @returns The card.
 * @throws {@link InvalidDocumentError} If it is not a valid card.
 */
export function parseServerCard(value: unknown, source: string): ServerCard {
  return parseDocument(serverCardSchema, value, 'Server Card', source);
}

/**
 * Builds a Server Card, adding its `$schema` and validating the result.
 *
 * @param fields - Everything but `$schema`.
 * @returns The card.
 * @throws {@link InvalidDocumentError} If a field breaks the spec (a long description, a bad name).
 */
export function createServerCard(fields: ServerCardFields): ServerCard {
  return parseServerCard({ $schema: SERVER_CARD_SCHEMA_URL, ...fields }, `Server Card "${fields.name}"`);
}

/**
 * The URL a server's card is served at by default: its streamable-HTTP URL plus `/server-card`.
 *
 * @param streamableHttpUrl - The MCP endpoint, e.g. `https://host/mcp`.
 * @returns E.g. `https://host/mcp/server-card`; a query or fragment on the input is dropped.
 */
export function serverCardUrl(streamableHttpUrl: string): string {
  const url = new URL(streamableHttpUrl);
  url.pathname = `${url.pathname.replace(/\/+$/, '')}${SERVER_CARD_PATH}`;
  url.search = '';
  url.hash = '';
  return url.href;
}

/** How to connect to a server from its card: the URL, and which headers the caller must supply. */
export interface CardConnection {
  /** The streamable-HTTP endpoint. */
  url: string;
  /** Names of required headers the card gives no value for, e.g. `Authorization`. Empty when none. */
  requiredHeaders: string[];
}

/**
 * The first streamable-HTTP remote on a card that can be used as it stands.
 *
 * @param card - A validated card.
 * @returns The connection, or null when every remote is SSE-only or templated with `{variables}`.
 */
export function cardConnection(card: ServerCard): CardConnection | null {
  const remote = card.remotes?.find((candidate) => {
    const isStreamable = candidate.type === TRANSPORT_STREAMABLE_HTTP;
    return isStreamable && candidate.url.includes('{') === false;
  });
  if (!remote) {
    return null;
  }
  const requiredHeaders = (remote.headers ?? [])
    .filter((header) => header.isRequired === true && header.value === undefined && header.default === undefined)
    .map((header) => header.name);
  return { url: remote.url, requiredHeaders };
}
