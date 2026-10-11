export * as SecureInput from "./secure-input.js"

import { Schema } from "effect"
import { optional } from "./schema.js"
import { ephemeral, inventory } from "./event.js"
import { ascending } from "./identifier.js"
import { SessionID } from "./session-id.js"
import { statics } from "./schema.js"

export const ID = Schema.String.check(Schema.isStartingWith("sec")).pipe(
  Schema.brand("SecureInput.ID"),
  Schema.annotate({ identifier: "SecureInput.ID" }),
  statics((schema) => ({ ascending: (id?: string) => schema.make(id ?? "sec_" + ascending()) })),
)
export type ID = typeof ID.Type

export const Request = Schema.Struct({
  id: ID,
  sessionID: SessionID,
  prompt: Schema.String.annotate({ description: "Password prompt text detected from command output" }),
  command: Schema.String.pipe(optional).annotate({ description: "The command that requested secure input" }),
}).annotate({ identifier: "SecureInputRequest" })
export interface Request extends Schema.Schema.Type<typeof Request> {}

const Asked = ephemeral({ type: "secure-input.asked", schema: Request.fields })
const Replied = ephemeral({
  type: "secure-input.replied",
  schema: {
    sessionID: SessionID,
    requestID: ID,
  },
})
const Rejected = ephemeral({
  type: "secure-input.rejected",
  schema: {
    sessionID: SessionID,
    requestID: ID,
  },
})
export const Event = { Asked, Replied, Rejected, Definitions: inventory(Asked, Replied, Rejected) }
