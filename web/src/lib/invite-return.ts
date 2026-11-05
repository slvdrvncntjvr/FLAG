// PRD-F9: auth continuation names a fixed route, never an invite bearer token.
export const INVITE_RETURN_PATH = "/invite/continue";

export function inviteReturnPath(value: unknown): string {
  return value === INVITE_RETURN_PATH ? INVITE_RETURN_PATH : "/home";
}

export function inviteAuthPath(page: "sign-in" | "onboarding", value: unknown): string {
  return inviteReturnPath(value) === INVITE_RETURN_PATH
    ? `/${page}?returnTo=${encodeURIComponent(INVITE_RETURN_PATH)}`
    : `/${page}`;
}
