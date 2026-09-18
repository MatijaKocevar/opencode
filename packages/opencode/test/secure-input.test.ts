import { describe, expect, test } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect, Fiber, Queue } from "effect"
import { SecureInput } from "../src/secure-input"
import { EventV2Bridge } from "../src/event-v2-bridge"
import { SessionID } from "../src/session/schema"
import { SecureInput as SecureInputSchema } from "@opencode-ai/schema/secure-input"
import { testEffect } from "./lib/effect"

const it = testEffect(
  LayerNode.compile(LayerNode.group([SecureInput.node, EventV2Bridge.node])),
)

describe("secure-input", () => {
  test("detects interactive commands only at command position", () => {
    for (const command of [
      "sudo whoami",
      "sudo -v && sudo apt update",
      "echo secret | sudo tee /etc/secret",
      "ssh host",
      "ansible-playbook -K site.yml",
      "su -",
      "gpg --decrypt file.gpg",
    ])
      expect(SecureInput.isInteractiveCommand(command)).toBe(true)

    for (const command of [
      "strings /usr/bin/sudo",
      'grep -rn "sudo: authenticate" /etc',
      "cat /etc/sudoers",
      "cat ~/.ssh/config",
      "grep ssh /tmp/log",
      "man gpg",
    ])
      expect(SecureInput.isInteractiveCommand(command)).toBe(false)
  })

  it.instance("detects a password prompt, emits an event, and submits input through the PTY", () =>
    Effect.gen(function* () {
      const secureInput = yield* SecureInput.Service
      const events = yield* EventV2Bridge.Service
      const asked = yield* Queue.unbounded<SecureInputSchema.Request>()

      const off = yield* events.listen((event) => {
        if (event.type === SecureInputSchema.Event.Asked.type) {
          Queue.offerUnsafe(asked, event.data as SecureInputSchema.Request)
        }
        return Effect.void
      })
      yield* Effect.addFinalizer(() => off)

      const sessionID = SessionID.make("ses_test-secure-input")
      const fiber = yield* secureInput
        .execute({
          command: 'read -p "Password: " pw; echo "got:$pw"',
          cwd: "/tmp",
          env: {},
          sessionID,
          timeout: "10 seconds",
        })
        .pipe(Effect.forkScoped)

      const request = yield* Queue.take(asked).pipe(Effect.timeout("10 seconds"))
      expect(request.prompt).toContain("Password")
      expect(request.sessionID).toBe(sessionID)

      yield* secureInput.submit({ requestID: request.id, input: "hunter2" })

      const result = yield* Fiber.join(fiber)
      expect(result.output).toContain("got:hunter2")
    }),
  )

  it.instance("detects the real [sudo] password prompt", () =>
    Effect.gen(function* () {
      const secureInput = yield* SecureInput.Service
      const events = yield* EventV2Bridge.Service
      const asked = yield* Queue.unbounded<SecureInputSchema.Request>()

      const off = yield* events.listen((event) => {
        if (event.type === SecureInputSchema.Event.Asked.type) {
          Queue.offerUnsafe(asked, event.data as SecureInputSchema.Request)
        }
        return Effect.void
      })
      yield* Effect.addFinalizer(() => off)

      const fiber = yield* secureInput
        .execute({
          command: 'read -p "[sudo] password for tester: " pw; echo "got:$pw"',
          cwd: "/tmp",
          env: {},
          sessionID: SessionID.make("ses_test-sudo"),
          timeout: "10 seconds",
        })
        .pipe(Effect.forkScoped)

      const request = yield* Queue.take(asked).pipe(Effect.timeout("10 seconds"))
      expect(request.prompt).toContain("sudo")
      expect(request.prompt).toContain("password for tester")

      yield* secureInput.submit({ requestID: request.id, input: "hunter2" })

      const result = yield* Fiber.join(fiber)
      expect(result.output).toContain("got:hunter2")
      expect(result.output).toContain("[password supplied]")
    }),
  )

  it.instance("rejects a pending request when the command exits without an answer", () =>
    Effect.gen(function* () {
      const secureInput = yield* SecureInput.Service
      const events = yield* EventV2Bridge.Service
      const asked = yield* Queue.unbounded<SecureInputSchema.Request>()
      const rejected = yield* Queue.unbounded<{ sessionID: string; requestID: string }>()

      const off = yield* events.listen((event) => {
        if (event.type === SecureInputSchema.Event.Asked.type) {
          Queue.offerUnsafe(asked, event.data as SecureInputSchema.Request)
        }
        if (event.type === SecureInputSchema.Event.Rejected.type) {
          Queue.offerUnsafe(rejected, event.data as { sessionID: string; requestID: string })
        }
        return Effect.void
      })
      yield* Effect.addFinalizer(() => off)

      const result = yield* secureInput.execute({
        command: 'printf "Password: "',
        cwd: "/tmp",
        env: {},
        sessionID: SessionID.make("ses_test-exit"),
        timeout: "10 seconds",
      })
      expect(result.exitCode).toBe(0)

      const request = yield* Queue.take(asked).pipe(Effect.timeout("10 seconds"))
      const rejection = yield* Queue.take(rejected).pipe(Effect.timeout("10 seconds"))
      expect(rejection.requestID).toBe(request.id)

      const submit = yield* Effect.result(secureInput.submit({ requestID: request.id, input: "hunter2" }))
      expect(submit._tag).toBe("Failure")
    }),
  )

  it.instance("keeps a pending request when the command prints more output", () =>
    Effect.gen(function* () {
      const secureInput = yield* SecureInput.Service
      const events = yield* EventV2Bridge.Service
      const asked = yield* Queue.unbounded<SecureInputSchema.Request>()

      const off = yield* events.listen((event) => {
        if (event.type === SecureInputSchema.Event.Asked.type) {
          Queue.offerUnsafe(asked, event.data as SecureInputSchema.Request)
        }
        return Effect.void
      })
      yield* Effect.addFinalizer(() => off)

      const fiber = yield* secureInput
        .execute({
          command: 'printf "Password: "; sleep 0.5; printf "more output"; sleep 30',
          cwd: "/tmp",
          env: {},
          sessionID: SessionID.make("ses_test-trailing"),
          timeout: "10 seconds",
        })
        .pipe(Effect.forkScoped)

      const request = yield* Queue.take(asked).pipe(Effect.timeout("10 seconds"))
      yield* Effect.sleep("1 second")

      const submit = yield* Effect.result(secureInput.submit({ requestID: request.id, input: "hunter2" }))
      expect(submit._tag).toBe("Success")

      yield* Fiber.interrupt(fiber)
    }),
  )
})
