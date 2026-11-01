import { APIError, isAPIError } from "better-auth/api";
import { BASE_ERROR_CODES } from "@better-auth/core/error";

// Ignore all library text/arguments, including Error.cause and adapter SQL.
// Only a fixed event and a finite, allowlisted severity reach the console.
export const authLogger = {
  level: "warn" as const,
  log(level: "debug" | "info" | "warn" | "error") {
    const severity = level === "error" ? "error" : level === "warn" ? "warn" : "info";
    console[severity]("AUTH_LIBRARY_EVENT", { severity });
  },
};

const retryMessages = new Map([
  ["SESSION_REVOCATION_FAILED", "Could not sign out. Try again later."],
  ["EMAIL_DELIVERY_FAILED", "Could not send the sign-in code. Try again later."],
  ["AUTH_UNAVAILABLE", "Authentication is unavailable. Try again later."],
]);

// Reconstruct known public errors from fixed definitions, never from exception
// text or additional body fields. Unknown client errors retain only their status.
const clientMessages = new Map<string, string>([
  ...Object.values(BASE_ERROR_CODES).map(({ code, message }) => [code, message] as [string, string]),
  ["OTP_EXPIRED", "OTP expired"],
  ["INVALID_OTP", "Invalid OTP"],
  ["TOO_MANY_ATTEMPTS", "Too many attempts"],
  ["PASSWORD_AUTH_DISABLED", "Password authentication is unavailable. Use an email sign-in code."],
  ["OTP_CHECK_DISABLED", "Use the email sign-in or verification form."],
  ["INVALID_USER_PROFILE", "Check the supplied profile fields. Do not include ID details or files."],
  ["REVIEWED_NAME_FIXED", "This name cannot be changed while under review or verified."],
  ["AUTH_REQUEST_REJECTED", "Check the authentication request and try again."],
]);

function retryError(code: unknown) {
  if (typeof code !== "string") return undefined;
  const message = retryMessages.get(code);
  return message ? new APIError("SERVICE_UNAVAILABLE", { code, message }) : undefined;
}

function retryHeaders(input: HeadersInit | undefined) {
  const headers = new Headers();
  const source = new Headers(input);
  for (const name of ["Retry-After", "X-Retry-After"]) {
    const value = source.get(name);
    if (value && /^\d{1,6}$/.test(value)) headers.set(name, value);
  }
  return headers;
}

export function safeAuthError(error: unknown): APIError {
  if (isAPIError(error)) {
    // Preserve redirects; failures carry only fixed messages and retry timing.
    if (error.statusCode < 400) return error;
    if (error.statusCode < 500) {
      const requestedCode = error.body?.code;
      const code = requestedCode && clientMessages.has(requestedCode) ? requestedCode : "AUTH_REQUEST_REJECTED";
      return new APIError(error.status, { code, message: clientMessages.get(code)! }, retryHeaders(error.headers));
    }
    const retry = retryError(error.body?.code);
    if (retry) return retry;
  }
  console.error("AUTH_UNEXPECTED_FAILURE");
  return new APIError("SERVICE_UNAVAILABLE", {
    code: "AUTH_UNAVAILABLE",
    message: "Authentication is unavailable. Try again later.",
  });
}

function errorResponse(error: APIError) {
  const headers = new Headers(error.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(error.body, {
    status: error.statusCode,
    headers,
  });
}

async function safeAuthResponse(response: Response): Promise<Response> {
  if (response.status < 400) return response;
  // The 1.7.7 dispatcher retains the handler's original status even when an
  // after hook replaces its APIError. It can also return errors as Responses
  // without throwing, for HTTP and server APIs using asResponse/request.
  const body = await response.json().catch(() => null) as { code?: string } | null;
  if (response.status < 500) {
    // APIError accepts a finite set of status names, not arbitrary HTTP numbers.
    // Unknown client statuses use the same bounded rejection as unknown codes.
    const statuses = {
      400: "BAD_REQUEST", 401: "UNAUTHORIZED", 403: "FORBIDDEN", 404: "NOT_FOUND",
      405: "METHOD_NOT_ALLOWED", 408: "REQUEST_TIMEOUT", 409: "CONFLICT", 410: "GONE",
      413: "PAYLOAD_TOO_LARGE", 415: "UNSUPPORTED_MEDIA_TYPE", 422: "UNPROCESSABLE_ENTITY",
      429: "TOO_MANY_REQUESTS",
    } as const;
    const status = statuses[response.status as keyof typeof statuses] ?? "BAD_REQUEST";
    return errorResponse(safeAuthError(new APIError(status, { code: body?.code }, retryHeaders(response.headers))));
  }
  return errorResponse(retryError(body?.code) ?? safeAuthError(undefined));
}

// Better Call's router onRequest is outside its error catch. Server-only APIs
// also bypass router onError entirely. Boundaries cover both without patching
// dependencies or altering the installed endpoint's hook pipeline.
export function withAuthSafety<T extends {
  handler: (request: Request) => Promise<Response>;
  fetch: (request: Request) => Promise<Response>;
  api: Record<string, unknown>;
}>(auth: T): T {
  const handler: T["handler"] = async request => {
    try { return await safeAuthResponse(await auth.handler(request)); }
    catch (error) {
      return errorResponse(safeAuthError(error));
    }
  };
  const api = Object.fromEntries(Object.entries(auth.api).map(([name, endpoint]) => {
    if (typeof endpoint !== "function") return [name, endpoint];
    const wrapped = async (...args: unknown[]) => {
      try {
        const result = await endpoint(...args);
        return result instanceof Response ? await safeAuthResponse(result) : result;
      }
      catch (error) {
        const safe = safeAuthError(error);
        const input = args[0] as { asResponse?: boolean; request?: unknown } | undefined;
        if (input?.asResponse === true || (input?.asResponse !== false && input?.request instanceof Request)) {
          return errorResponse(safe);
        }
        throw safe;
      }
    };
    return [name, Object.assign(wrapped, endpoint)];
  }));
  return { ...auth, handler, fetch: handler, api } as T;
}
