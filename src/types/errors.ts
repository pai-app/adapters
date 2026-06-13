/**
 * Discriminated error type for all parser failures. Callers branch on `kind`.
 *
 * Only `password-required` is recoverable — caller prompts the user, appends
 * the new password to the list, and retries `parseFile` / `parseEmail`.
 */

export type ParseErrorKind =
  | "password-required"
  | "extraction-failed"
  | "unsupported-file"
  | "ambiguous-format"
  | "parse-failed"

export class ParseError extends Error {
  readonly kind: ParseErrorKind

  constructor(message: string, options: {
    readonly kind: ParseErrorKind
    readonly cause?: Error
  }) {
    super(message, { cause: options.cause })
    this.name = "ParseError"
    this.kind = options.kind
  }
}
