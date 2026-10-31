export * as SecureInput from "./secure-input.js"

import { makeLocationNode } from "@opencode/util/effect/app-node"
import { Effect, Layer, Schema, Duration, Context } from "effect"
import { Bus } from "./bus.js"
import { SessionSchema } from "./session/schema.js"
import { spawn } from "./pty.js"
import { SecureInput as SecureInputSchema } from "@opencode/schema/secure-input"

export const SecureInputID = SecureInputSchema.ID
export type SecureInputID = typeof SecureInputID.Type

export function nextSecureInputID(id?: string): SecureInputID {
  if (id !== undefined) {
    if (!id.startsWith("sec_")) throw new Error(`ID ${id} does not start with sec_`)
    return id as SecureInputID
  }
  return SecureInputID.ascending()
}

export const SecureInputRequest = SecureInputSchema.Request
export type SecureInputRequest = Schema.Schema.Type<typeof SecureInputRequest>

const PASSWORD_PATTERNS = [
  /\[sudo\] password for .+:/i,
  /Password:/i,
  /Enter passphrase for .+:/i,
  /BECOME password:/i,
  /SSH password:/i,
  /passphrase for .+:/i,
  /password for .+:/i,
  /Sorry, try again\./i,
  /\(yes\/no.*\)\?/i,
] as const

const COMMAND_START = "(?:^|[;&|(\\n]\\s*|\\$\\(\\s*|`\\s*)"

const INTERACTIVE_COMMANDS = [
  new RegExp(`${COMMAND_START}(?:sudo|su|ssh|gpg)\\b`),
  new RegExp(`${COMMAND_START}ansible(?:-playbook)?\\b[^\\n]*(?:-K\\b|--ask-become-pass\\b)`),
] as const

export function isInteractiveCommand(command: string): boolean {
  return INTERACTIVE_COMMANDS.some((re) => re.test(command))
}

export function detectPasswordPrompt(output: string): string | undefined {
  for (const re of PASSWORD_PATTERNS) {
    const match = output.match(re)
    if (match) return match[0]
  }
  return undefined
}

/**
 * Strips a submitted secret from the PTY output stream.
 *
 * A child can leave the terminal in echo mode, or print its prompt before it
 * disables echo (sudo does this when it is started from a script), and then
 * the tty echoes the secret straight back down the master. Without this the
 * secret ends up in the captured output, the session transcript and the model
 * context. Match across chunk boundaries so a split echo is still removed.
 */
export class SecretRedactor {
  private secret = ""
  private carry = ""

  arm(secret: string) {
    this.secret = secret
    this.carry = ""
  }

  push(chunk: string): string {
    if (!this.secret) return chunk
    const secret = this.secret
    const text = this.carry + chunk
    this.carry = ""

    let out = ""
    let index = 0
    for (;;) {
      const found = text.indexOf(secret, index)
      if (found === -1) break
      out += text.slice(index, found)
      index = found + secret.length
    }

    // Hold back a tail that could be the start of an echo split across chunks.
    const rest = text.slice(index)
    for (let n = Math.min(secret.length - 1, rest.length); n > 0; n--) {
      if (secret.startsWith(rest.slice(-n))) {
        this.carry = rest.slice(-n)
        return out + rest.slice(0, rest.length - n)
      }
    }
    return out + rest
  }

  // A held-back tail is by construction a prefix of the secret. Drop it rather
  // than flush a partial secret when the process exits mid-echo.
  clear() {
    this.secret = ""
    this.carry = ""
  }
}

export class CancelledError extends Schema.TaggedError<CancelledError>()("SecureInputCancelledError", {}) {
  override get message() {
    return "The user cancelled the secure input prompt"
  }
}

export class TimedOutError extends Schema.TaggedError<TimedOutError>()("SecureInputTimedOutError", {}) {
  override get message() {
    return "Secure input request timed out"
  }
}

export class NotFoundError extends Schema.TaggedError<NotFoundError>()("SecureInput.NotFoundError", {
  requestID: SecureInputID,
}) {}

interface PendingEntry {
  info: SecureInputRequest
  resolve: (value: string) => void
  reject: (error: CancelledError | TimedOutError) => void
  promise: Promise<string>
}

export interface Interface {
  readonly request: (input: {
    sessionID: SessionSchema.ID
    prompt: string
    command?: string
  }) => Effect.Effect<string, CancelledError | TimedOutError>
  readonly submit: (input: { requestID: SecureInputID; input: string }) => Effect.Effect<void, NotFoundError>
  readonly cancel: (requestID: SecureInputID) => Effect.Effect<void, NotFoundError>
  readonly list: () => Effect.Effect<ReadonlyArray<SecureInputRequest>>
  readonly execute: (input: {
    command: string
    cwd: string
    env: Record<string, string>
    sessionID: SessionSchema.ID
    timeout: Duration.Input
  }) => Effect.Effect<{ output: string; exitCode: number | null }>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SecureInput") {}

function createEntry(info: SecureInputRequest): PendingEntry {
  let resolve!: (value: string) => void
  let reject!: (error: CancelledError | TimedOutError) => void
  const promise = new Promise<string>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { info, resolve, reject, promise }
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const bus = yield* Bus.Service
    const pending = new Map<SecureInputID, PendingEntry>()

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        for (const item of pending.values()) {
          item.reject(new CancelledError())
        }
        pending.clear()
      }),
    )

    const request = Effect.fn("SecureInput.request")(function* (input: {
      sessionID: SessionSchema.ID
      prompt: string
      command?: string
    }) {
      const id = nextSecureInputID()
      yield* Effect.logInfo("requesting secure input", { id })

      const info: SecureInputRequest = {
        id,
        sessionID: input.sessionID,
        prompt: input.prompt,
        command: input.command,
      }
      const entry = createEntry(info)
      pending.set(id, entry)
      yield* bus.publish(SecureInputSchema.Event.Asked, info)

      return yield* Effect.tryPromise({
        try: () => entry.promise,
        catch: (error) => error as CancelledError | TimedOutError,
      }).pipe(
        Effect.ensuring(Effect.sync(() => pending.delete(id))),
      )
    })

    const submit = Effect.fn("SecureInput.submit")(function* (input: {
      requestID: SecureInputID
      input: string
    }) {
      const existing = pending.get(input.requestID)
      if (!existing) {
        yield* Effect.logWarning("submit for unknown request", { requestID: input.requestID })
        return yield* new NotFoundError({ requestID: input.requestID })
      }
      pending.delete(input.requestID)
      yield* Effect.logInfo("secure input submitted", { requestID: input.requestID })
      yield* bus.publish(SecureInputSchema.Event.Replied, {
        sessionID: existing.info.sessionID,
        requestID: existing.info.id,
      })
      existing.resolve(input.input)
    })

    const cancel = Effect.fn("SecureInput.cancel")(function* (requestID: SecureInputID) {
      const existing = pending.get(requestID)
      if (!existing) {
        yield* Effect.logWarning("cancel for unknown request", { requestID })
        return yield* new NotFoundError({ requestID })
      }
      pending.delete(requestID)
      yield* Effect.logInfo("secure input cancelled", { requestID })
      yield* bus.publish(SecureInputSchema.Event.Rejected, {
        sessionID: existing.info.sessionID,
        requestID: existing.info.id,
      })
      existing.reject(new CancelledError())
    })

    const list = Effect.fn("SecureInput.list")(function* () {
      return Array.from(pending.values(), (x) => x.info)
    })

    const execute = Effect.fn("SecureInput.execute")(function* (input: {
      command: string
      cwd: string
      env: Record<string, string>
      sessionID: SessionSchema.ID
      timeout: Duration.Input
    }) {
      const shell = process.platform === "win32" ? "cmd.exe" : "/bin/bash"
      const timeoutMs = Duration.toMillis(input.timeout)
      const context = yield* Effect.context()
      const runFork = Effect.runForkWith(context)

      const pty = yield* spawn(shell, ["-c", input.command], {
        name: "xterm-256color",
        cwd: input.cwd,
        env: { ...input.env, TERM: "xterm-256color" } as Record<string, string>,
      })

      return yield* Effect.promise<{ output: string; exitCode: number | null }>(
        () =>
          new Promise<{ output: string; exitCode: number | null }>((resolve) => {
            let output = ""
            let exitCode: number | null = null
            let passwordBuffer = ""
            const redactor = new SecretRedactor()
            let currentEntry: PendingEntry | null = null
            let currentID: SecureInputID | null = null

            const endCurrent = (error: CancelledError | TimedOutError) => {
              if (!currentEntry || !currentID) return
              const entry = currentEntry
              const id = currentID
              currentEntry = null
              currentID = null
              passwordBuffer = ""
              pending.delete(id)
              runFork(
                bus.publish(SecureInputSchema.Event.Rejected, {
                  sessionID: entry.info.sessionID,
                  requestID: id,
                }),
              )
              entry.reject(error)
            }

            const dataDisp = pty.onData((chunk: string) => {
              const visible = redactor.push(chunk)
              output += visible

              // Only one request per execution: while it is pending, later output
              // must not supersede it or drop it without telling clients.
              if (currentEntry) return

              passwordBuffer += visible
              if (Buffer.byteLength(passwordBuffer, "utf-8") > 4096) {
                passwordBuffer = passwordBuffer.slice(-2048)
              }

              const promptText = detectPasswordPrompt(passwordBuffer)
              if (!promptText) return

              const id = nextSecureInputID()
              currentID = id
              const info: SecureInputRequest = {
                id,
                sessionID: input.sessionID,
                prompt: promptText,
                command: input.command,
              }
              const entry = createEntry(info)
              currentEntry = entry
              pending.set(id, entry)
              output = output.replace(promptText, "[password supplied]")
              passwordBuffer = ""

              runFork(bus.publish(SecureInputSchema.Event.Asked, info))

              entry.promise
                .then((password) => {
                  // Arm before writing: the echo can arrive in the same tick.
                  redactor.arm(password)
                  pty.write(password + "\n")
                })
                .catch(() => {
                  pty.kill()
                })
                .finally(() => {
                  if (currentEntry === entry) currentEntry = null
                  if (currentID === id) currentID = null
                })
            })

            const exitDisp = pty.onExit((event) => {
              exitCode = event.exitCode
              redactor.clear()
              endCurrent(new CancelledError())
              resolve({ output, exitCode })
            })

            const timeoutId = setTimeout(() => {
              if (exitCode === null) {
                endCurrent(new TimedOutError())
                pty.kill()
                resolve({ output, exitCode: null })
              }
            }, timeoutMs)

            return () => {
              clearTimeout(timeoutId)
              dataDisp.dispose()
              exitDisp.dispose()
            }
          }),
      )
    })

    return Service.of({ request, submit, cancel, list, execute })
  }),
)

export const node = makeLocationNode({ service: Service, layer, deps: [Bus.node] })
