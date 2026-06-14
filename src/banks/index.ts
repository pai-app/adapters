/**
 * Static list of every bank the package can parse. Each bank is a plain `Bank`
 * value; `parseFile` / `parseEmail` walk this array. No runtime registration —
 * the set is fixed for a given package version.
 */

import type { Bank } from '@/types'
import { hdfcBank } from './hdfc/index'
import { federalBank } from './federal/index'
import { jupiterBank } from './jupiter/index'
import { paytmBank } from './paytm/index'

export const BANKS: readonly Bank[] = [hdfcBank, federalBank, jupiterBank, paytmBank]
