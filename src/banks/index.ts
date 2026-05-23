/**
 * Importing this module registers all bank adapters with the internal registry.
 * The public entry point (`src/index.ts`) imports this so `parseFile` /
 * `parseEmail` have adapters available at call time.
 */

import './hdfc/index'
import './federal/index'
import './jupiter/index'
import './paytm/index'
