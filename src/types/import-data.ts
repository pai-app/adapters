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
 * The package's public output. `bankId`, `offeringId`, and `kind` are filled
 * by the package from the matched bank/offering. Parsers only return
 * `{ account, transactions }`.
 */
export type ImportData = {
  readonly bankId: string
  readonly offeringId: string
  readonly kind: AccountKind
  readonly account: AccountDetails
  readonly transactions: readonly TransactionDetails[]
}

/**
 * The shape that internal adapters return. The package decorates this with
 * `bankId`, `offeringId`, and `kind` before returning `ImportData` to callers.
 */
export type AdapterResult = {
  readonly account: AccountDetails
  readonly transactions: readonly TransactionDetails[]
}
