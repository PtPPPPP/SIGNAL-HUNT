/** Returns a safe text representation for errors received at UI boundaries. */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
