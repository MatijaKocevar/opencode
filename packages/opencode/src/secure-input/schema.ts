import { Schema } from "effect"
import { SecureInput as SecureInputSchema } from "@opencode-ai/schema/secure-input"

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
