/**
 * Where an mDNS error goes when it can't be thrown: to the caller's handler, or out as a process warning.
 */

/**
 * A function that hands errors to `onError`, or emits them as process warnings when it is unset.
 *
 * @param [onError] - The caller's handler.
 * @returns The reporter.
 */
export function errorReporter(onError?: (error: Error) => void): (error: Error) => void {
  return (error) => {
    if (onError) {
      onError(error);
      return;
    }
    process.emitWarning(error);
  };
}
