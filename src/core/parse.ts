import { prettifyError, type z } from 'zod';
import { InvalidDocumentError } from './errors.ts';

/**
 * Validates a document against its schema.
 *
 * @typeParam S - The schema; the result is its output type.
 * @param schema - What the document must match.
 * @param value - The parsed JSON.
 * @param kind - What the document is, for the message (`Server Card`, `AI Catalog`).
 * @param source - Where it came from, for the message.
 * @returns The validated document.
 * @throws {@link InvalidDocumentError} If the document does not match, listing each issue.
 */
export function parseDocument<S extends z.ZodType>(
  schema: S,
  value: unknown,
  kind: string,
  source: string,
): z.output<S> {
  const result = schema.safeParse(value);
  if (result.success) {
    return result.data;
  }
  throw new InvalidDocumentError(`${source} is not a valid ${kind}:\n${prettifyError(result.error)}`, source, {
    cause: result.error,
  });
}
