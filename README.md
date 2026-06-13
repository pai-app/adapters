# @pai-app/adapters

[![CI](https://github.com/pai-app/adapters/actions/workflows/ci.yml/badge.svg)](https://github.com/pai-app/adapters/actions/workflows/ci.yml)
[![Publish](https://github.com/pai-app/adapters/actions/workflows/publish.yml/badge.svg)](https://github.com/pai-app/adapters/actions/workflows/publish.yml)
[![codecov](https://codecov.io/gh/pai-app/adapters/branch/main/graph/badge.svg)](https://codecov.io/gh/pai-app/adapters)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)
![License](https://img.shields.io/badge/license-MIT-blue)

Bank statement and email parsers for **Pai** — pure TypeScript, no React, no
storage, no fyre-db access. Bytes/text in → structured `ImportData` out.

## Install

```bash
npm install @pai-app/adapters
```

## Public API

```ts
import {
  parseFile,
  parseEmail,
  extractPdfPages,
  extractExcelSheets,
  type ImportData,
  type MailMessage,
  type ParseError,
} from '@pai-app/adapters'

// File path
const data = await parseFile(file, [savedPassword])
if (data) { /* persist */ }

// Email path
const data = await parseEmail(mailMessage, [savedPassword])
if (data) { /* persist */ }
```

`parseFile` and `parseEmail` return `ImportData | null`. They throw
`ParseError` for `password-required`, `extraction-failed`, `unsupported-file`,
`ambiguous-format`, `parse-failed`. Only `password-required` is recoverable —
caller prompts the user, retries with the new password appended to the list.

## Design

See `docs/pai-adapters-plan.md` in the workspace root for the full design and
phase plan. Bank/adapter authoring is internal; consumers only see the public
API above.

## Build

```
npm run build       # tsup ESM + dts
npm run lint        # eslint with strictTypeChecked
npm run test        # vitest
```
