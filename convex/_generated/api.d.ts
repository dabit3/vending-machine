/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accessRequests from "../accessRequests.js";
import type * as admins from "../admins.js";
import type * as auditLogs from "../auditLogs.js";
import type * as claims from "../claims.js";
import type * as codes from "../codes.js";
import type * as emails from "../emails.js";
import type * as eventAdmins from "../eventAdmins.js";
import type * as events from "../events.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accessRequests: typeof accessRequests;
  admins: typeof admins;
  auditLogs: typeof auditLogs;
  claims: typeof claims;
  codes: typeof codes;
  emails: typeof emails;
  eventAdmins: typeof eventAdmins;
  events: typeof events;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
