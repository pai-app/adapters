import { describe, it, expect } from "vitest"

describe("scaffold", () => {
  it("loads the package without crashing", async () => {
    const mod = await import("@/index")
    expect(mod).toBeDefined()
  })
})
