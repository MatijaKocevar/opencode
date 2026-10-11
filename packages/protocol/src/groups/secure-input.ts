import { Location } from "@opencode/schema/location"
import { SecureInput } from "@opencode/schema/secure-input"
import { Context, Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiMiddleware, HttpApiSchema, OpenApi } from "effect/http-api"
import { SecureInputNotFoundError } from "../errors.js"
import { LocationQuery, locationQueryOpenApi } from "./location.js"

export const makeSecureInputGroup = <LocationId extends HttpApiMiddleware.AnyId, LocationService>(
  locationMiddleware: Context.Key<LocationId, LocationService>,
) =>
  HttpApiGroup.make("server.secureInput")
    .add(
      HttpApiEndpoint.get("secureInput.list", "/api/secure-input", {
        query: LocationQuery,
        success: Location.response(Schema.Array(SecureInput.Request)),
      })
        .annotateMerge(locationQueryOpenApi)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "secureInput.list",
            summary: "List pending secure input requests",
            description: "Get all pending secure input (password) requests across all sessions.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.post("secureInput.submit", "/api/secure-input/:requestID/submit", {
        params: { requestID: SecureInput.ID },
        query: LocationQuery,
        payload: Schema.Struct({ input: Schema.String }),
        success: HttpApiSchema.NoContent,
        error: SecureInputNotFoundError,
      })
        .annotateMerge(locationQueryOpenApi)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "secureInput.submit",
            summary: "Submit secure input",
            description: "Submit a password or other secure input for a pending request.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.post("secureInput.cancel", "/api/secure-input/:requestID/cancel", {
        params: { requestID: SecureInput.ID },
        query: LocationQuery,
        success: HttpApiSchema.NoContent,
        error: SecureInputNotFoundError,
      })
        .annotateMerge(locationQueryOpenApi)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "secureInput.cancel",
            summary: "Cancel secure input request",
            description: "Cancel a pending secure input request.",
          }),
        ),
    )
    .annotateMerge(
      OpenApi.annotations({ title: "secure-input", description: "Secure input (password) routes." }),
    )
    .middleware(locationMiddleware)
