import { describe, expect, test } from "bun:test"
import { detectPasswordPrompt, SecretRedactor } from "@opencode/core/secure-input"

describe("SecretRedactor", () => {
  test("removes an echoed secret", () => {
    const redactor = new SecretRedactor()
    redactor.arm("correct horse")
    expect(redactor.push("[sudo] password for x:\r\ncorrect horse\r\n")).toBe(
      "[sudo] password for x:\r\n\r\n",
    )
  })

  test("removes an echo split across chunks", () => {
    const redactor = new SecretRedactor()
    redactor.arm("hunter2")
    let out = ""
    for (const chunk of ["before hun", "ter", "2 after"]) out += redactor.push(chunk)
    expect(out).toBe("before  after")
  })

  test("leaves normal output untouched when nothing was armed", () => {
    const redactor = new SecretRedactor()
    expect(redactor.push("plain output")).toBe("plain output")
  })

  test("never releases a partial secret held back at exit", () => {
    const redactor = new SecretRedactor()
    redactor.arm("hunter2")
    expect(redactor.push("hun")).toBe("")
    redactor.clear()
    expect(redactor.push("ter2")).toBe("ter2")
  })
})

describe("detectPasswordPrompt", () => {
  test("matches sudo and ssh prompts", () => {
    expect(detectPasswordPrompt("[sudo] password for mkocevar:")).toBe("[sudo] password for mkocevar:")
    expect(detectPasswordPrompt("Enter passphrase for key '/home/x/.ssh/id_ed25519':")).toBe(
      "Enter passphrase for key '/home/x/.ssh/id_ed25519':",
    )
    expect(detectPasswordPrompt("no prompt here")).toBeUndefined()
  })
})
