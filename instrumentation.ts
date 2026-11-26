import type { Instrumentation } from "next";
import { sendErrorAlert } from "./lib/error-alerts";

export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context
) => {
  const message = err instanceof Error ? err.message : String(err);
  const digest =
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof err.digest === "string"
      ? err.digest
      : undefined;

  const pathname = request.path.split(/[?#]/, 1)[0];

  await sendErrorAlert({
    source: "server",
    message,
    digest,
    path: pathname,
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
  });
};
