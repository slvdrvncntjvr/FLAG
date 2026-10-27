import assert from "node:assert/strict";
import { getDeploymentTarget } from "./check-resource-bindings.mjs";

// The application OTP hook emits Retry-After AND X-Retry-After. Better Auth's
// general route limiter emits only X-Retry-After; that is not proof of the OTP cap.
// Never retry failures, follow redirects, print response bodies, or request a code.
function retryDelay(value) {
  if (value === null) return "missing";
  return /^\d+$/.test(value) && Number(value) > 0 && Number(value) <= 900 ? "valid" : "invalid";
}

export async function probeDevOtpThrottle({ target, base, fetchImpl = fetch, report = console.error }) {
  assert.equal(target, "dev", "OTP throttle probes are allowed only for dev, never production");
  assert.equal(base, getDeploymentTarget("dev").authUrl, "OTP throttle probes require the exact dev origin");
  const email = `release-check-${crypto.randomUUID()}@example.invalid`;
  const statuses = [];
  const observations = [];
  for (let attempt = 1; attempt <= 6; attempt++) {
    let response;
    try {
      response = await fetchImpl(`${base}/api/auth/sign-in/email-otp`, {
        method: "POST", redirect: "manual",
        headers: { "content-type": "application/json", origin: base },
        body: JSON.stringify({ email, otp: "000000" }), signal: AbortSignal.timeout(20000),
      });
      // Discard without logging credentials, addresses, body content or header values.
      await response.arrayBuffer();
    } catch {
      report(JSON.stringify({ otpLimitVerified: false, throttleStateWrites: true, statuses, attempt, failure: "request-or-body-read-failed" }));
      throw new Error(`Dev OTP probe request/body read failed at attempt ${attempt}; throttle state may have been written. No automatic retry.`);
    }
    statuses.push(response.status);
    observations.push({ attempt, status: response.status,
      retryAfter: retryDelay(response.headers.get("retry-after")),
      alternateRetryAfter: retryDelay(response.headers.get("x-retry-after")) });
    const expectedStatus = attempt === 6 ? 429 : 400;
    const unexpectedStatus = response.status !== expectedStatus;
    const missingDelay = attempt === 6 && observations.at(-1).retryAfter !== "valid";
    if (unexpectedStatus || missingDelay) {
      report(JSON.stringify({ otpLimitVerified: false, throttleStateWrites: true, statuses, observations,
        failure: unexpectedStatus ? "unexpected-status" : "missing-or-invalid-retry-after" }));
      throw new Error(unexpectedStatus
        ? `Dev OTP probe expected HTTP ${expectedStatus} at attempt ${attempt}, received ${response.status}. Shared route throttling, access challenges or upstream errors require operator diagnosis; no automatic retry.`
        : "Dev OTP probe received HTTP 429 without a valid Retry-After delay (1-900 seconds). X-Retry-After alone may indicate the general auth limiter and does not verify the OTP limit.");
    }
  }
  return { otpLimitVerified: true, otpThrottleSkipped: false, throttleStateWrites: true, statuses };
}
