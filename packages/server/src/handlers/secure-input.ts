import { SecureInput } from "@opencode/core/secure-input"
import { SecureInputNotFoundError } from "@opencode/protocol/errors"
import { Effect } from "effect"
import { HttpApiBuilder, HttpApiSchema } from "effect/http-api"
import { Api } from "../api"
import { response } from "../location"

function missingRequest(id: SecureInput.SecureInputID) {
  return new SecureInputNotFoundError({ requestID: String(id), message: `Secure input request not found: ${id}` })
}

export const SecureInputHandler = HttpApiBuilder.group(Api, "server.secureInput", (handlers) =>
  Effect.gen(function* () {
    return handlers
      .handle(
        "secureInput.list",
        Effect.fn(function* () {
          const secureInput = yield* SecureInput.Service
          return yield* response(secureInput.list())
        }),
      )
      .handle(
        "secureInput.submit",
        Effect.fn(function* (ctx) {
          const secureInput = yield* SecureInput.Service
          yield* secureInput
            .submit({ requestID: ctx.params.requestID, input: ctx.payload.input })
            .pipe(Effect.catchTag("SecureInput.NotFoundError", (error) => Effect.fail(missingRequest(error.requestID))))
          return HttpApiSchema.NoContent.make()
        }),
      )
      .handle(
        "secureInput.cancel",
        Effect.fn(function* (ctx) {
          const secureInput = yield* SecureInput.Service
          yield* secureInput
            .cancel(ctx.params.requestID)
            .pipe(Effect.catchTag("SecureInput.NotFoundError", (error) => Effect.fail(missingRequest(error.requestID))))
          return HttpApiSchema.NoContent.make()
        }),
      )
  }),
)
