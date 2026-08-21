export * as SecureInput from "./secure-input"

import { Schema } from "effect"
import { optional } from "./schema"
import { define, inventory } from "./event"
import { ascending } from "./identifier"
import { SessionID } from "./session-id"
import { statics } from "./schema"

export const ID = Schema.String.check(Schema.isStartsWith("sec")).pipe(
  Schema.brand("SecureInputID"),
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

const Asked = define({ type: "secure-input.asked", schema: Request.fields })
const Replied = define({
  type: "secure-input.replied",
  schema: {
    sessionID: SessionID,
    requestID: ID,
  },
})
const Rejected = define({
  type: "secure-input.rejected",
  schema: {
    sessionID: SessionID,
    requestID: ID,
  },
})
export const Event = { Asked, Replied, Rejected, Definitions: inventory(Asked, Replied, Rejected) }
