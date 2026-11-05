import assert from "node:assert/strict";
import test from "node:test";
import { inviteAuthPath, inviteReturnPath } from "../src/lib/invite-return.ts";

test("auth continuation accepts only the fixed token-free invite destination", () => {
  assert.equal(inviteReturnPath("/invite/continue"), "/invite/continue");
  assert.equal(inviteAuthPath("sign-in", "/invite/continue"), "/sign-in?returnTo=%2Finvite%2Fcontinue");
  assert.equal(inviteAuthPath("onboarding", "/invite/continue"), "/onboarding?returnTo=%2Finvite%2Fcontinue");
  for (const value of [undefined, null, [], ["/invite/continue"], {}, "/home", "https://example.invalid", "//example.invalid", "/\\example.invalid", "javascript:alert(1)", "/invite/continue?token=secret", "/invite/continue#secret", "/invite/" + "a".repeat(64), "/invite/%63ontinue", "/invite/continue/", " /invite/continue", "/invite/continue\n"]) {
    assert.equal(inviteReturnPath(value), "/home");
    assert.equal(inviteAuthPath("sign-in", value), "/sign-in");
    assert.equal(inviteAuthPath("onboarding", value), "/onboarding");
  }
});
