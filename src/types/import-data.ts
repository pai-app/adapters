/**
 * Public output shapes returned by `parseFile` and `parseEmail`.
 */

/**
 * Account kind — mirrors fin's `MoneyAccountKind`. Determines sign convention,
 * balance display, and default icon in the consumer app.
 */
export type AccountKind =
  | "bank"
  | "credit-card"
  | "cash"
  | "wallet"
  | "loan"
  | "investment"

/**
 * Identifiers extracted from a bank statement or email. Used by the consumer
 * to match against existing accounts or create new ones.
 *
 * `currency` is required — it's the single source of truth for the statement's
 * denomination and drives minor-unit conversion in the parser.
 */
export type AccountDetails = {
  readonly currency: string                                // ISO 4217, e.g. "INR"
  readonly accountNumber?: readonly string[]
  readonly accountHolderName?: readonly string[]
  readonly customerId?: readonly string[]
  readonly ifscCode?: readonly string[]
  readonly swiftCode?: readonly string[]
  readonly micrCode?: readonly string[]
}

/**
 * A single parsed transaction row.
 *
 * `amount` is a signed integer in minor units of the statement's currency
 * (e.g. 123450 = ₹1,234.50 for INR; 5000 = ¥5,000 for JPY). Positive = credit,
 * negative = debit.
 */
export type TransactionDetails = {
  readonly date: number                                    // ms epoch
  readonly description: string
  readonly amount: number                                  // signed minor units
}

/**
 * Best-effort summary of an account statement's closing figures.
 *
 * Every field is optional — a missing summary (or a missing field) never fails
 * the parse. Amounts are signed integers in minor units of the statement's
 * currency: assets are positive, liabilities (credit-card/loan) are negative.
 * Timestamps are ms epoch.
 */
export type StatementSummary = {
  readonly asOf?: number            // statement close date (ms epoch) — the latest periodEnd
  readonly periodStart?: number     // statement period start
  readonly periodEnd?: number       // statement period end — the source of asOf
  readonly closingBalance?: number  // signed minor units — assets +, liabilities (credit-card/loan) −
  readonly available?: number       // available funds / available credit
  readonly creditLimit?: number     // credit-card
  readonly minimumDue?: number      // credit-card
  readonly dueDate?: number         // credit-card payment due (ms epoch)
}

/**
 * The package's public output. `bankId`, `offeringId`, and `kind` are filled
 * by the package from the matched bank/offering. Parsers only return
 * `{ account, transactions }` (and optionally `statement`).
 */
export type ImportData = {
  readonly bankId: string
  readonly offeringId: string
  readonly kind: AccountKind
  readonly account: AccountDetails
  readonly transactions: readonly TransactionDetails[]
  readonly statement?: StatementSummary
}

/**
 * The shape that internal adapters return. The package decorates this with
 * `bankId`, `offeringId`, and `kind` before returning `ImportData` to callers.
 */
export type AdapterResult = {
  readonly account: AccountDetails
  readonly transactions: readonly TransactionDetails[]
  readonly statement?: StatementSummary
}
