import { SecureInput } from "@/secure-input"
import { SecureInputID } from "@/secure-input/schema"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import { SecureInputNotFoundError } from "../errors"

export const secureInputHandlers = HttpApiBuilder.group(InstanceHttpApi, "secure-input", (handlers) =>
  Effect.gen(function* () {
    const svc = yield* SecureInput.Service

    const list = Effect.fn("SecureInputHttpApi.list")(function* () {
      return yield* svc.list()
    })

    const submit = Effect.fn("SecureInputHttpApi.submit")(function* (ctx: {
      params: { requestID: SecureInputID }
      payload: { input: string }
    }) {
      yield* svc
        .submit({ requestID: ctx.params.requestID, input: ctx.payload.input })
        .pipe(
          Effect.catchTag("SecureInput.NotFoundError", (error) =>
            Effect.fail(
              new SecureInputNotFoundError({
                requestID: String(error.requestID),
                message: `Secure input request not found: ${error.requestID}`,
              }),
            ),
          ),
        )
      return true
    })

    const cancel = Effect.fn("SecureInputHttpApi.cancel")(function* (ctx: { params: { requestID: SecureInputID } }) {
      yield* svc.cancel(ctx.params.requestID).pipe(
        Effect.catchTag("SecureInput.NotFoundError", (error) =>
          Effect.fail(
            new SecureInputNotFoundError({
              requestID: String(error.requestID),
              message: `Secure input request not found: ${error.requestID}`,
            }),
          ),
        ),
      )
      return true
    })

    return handlers.handle("list", list).handle("submit", submit).handle("cancel", cancel)
  }),
)
