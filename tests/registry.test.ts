import { describe, it, expect } from 'vitest'
import type { Bank } from '@/types'
import { registerBank, registeredBanks, statementEmailDomains } from '@/registry'

function makeBank(id: string, emailDomains?: readonly string[]): Bank {
  return { id, ...(emailDomains && { emailDomains }), offerings: [] }
}

describe('registry', () => {
  it('starts empty in an isolated module graph', () => {
    expect(registeredBanks()).toEqual([])
  })

  it('registers a bank and returns it', () => {
    registerBank(makeBank('alpha', ['alpha.example']))
    expect(registeredBanks().map((b) => b.id)).toContain('alpha')
  })

  it('replaces an existing bank with the same id', () => {
    registerBank(makeBank('beta', ['old.example']))
    registerBank(makeBank('beta', ['new.example']))
    const beta = registeredBanks().filter((b) => b.id === 'beta')
    expect(beta).toHaveLength(1)
    expect(beta[0].emailDomains).toEqual(['new.example'])
  })

  it('flattens and de-duplicates statement email domains', () => {
    registerBank(makeBank('gamma', ['shared.example', 'gamma.example']))
    registerBank(makeBank('delta', ['shared.example', 'delta.example']))
    registerBank(makeBank('epsilon')) // no emailDomains → contributes nothing
    const domains = statementEmailDomains()
    expect(domains).toContain('shared.example')
    expect(domains.filter((d) => d === 'shared.example')).toHaveLength(1)
    expect(domains).toContain('gamma.example')
    expect(domains).toContain('delta.example')
  })
})
