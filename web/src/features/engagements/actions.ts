"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@/server/db";
import { getViewer, requireViewer, requireVerifiedFreelancer } from "@/server/auth/guards";
import { loadInviteLanding } from "@/server/db/queries/engagements";
import { acceptInvitation, cancelInvitation, createInvitation, declineInvitation } from "./handlers";
import { failed, hashInvite, INVITE_CONTINUATION_SECONDS, INVITE_RETURN_PATH, PENDING_INVITE_COOKIE, tokenInput, type EngagementResult } from "./schema";

export async function createEngagement(_previous: EngagementResult<{ invitePath: string }> | null, data: FormData): Promise<EngagementResult<{ invitePath: string }>> {
  const viewer = await requireVerifiedFreelancer().catch(() => null);
  if (!viewer) return failed("Only verified freelancers with current acknowledgments can invite.");
  if (!validForm(data, ["title", "clientNameHint", "startedOn"])) return failed("Check the invitation fields.");
  return createInvitation(await getDb(), viewer.id, {
    title: data.get("title"), clientNameHint: data.get("clientNameHint"), startedOn: data.get("startedOn"),
  });
}

export async function continueInvite(_previous: EngagementResult | null, data: FormData): Promise<EngagementResult> {
  if (!validForm(data, ["token"])) { await clearInvite(); return failed("This invitation is unavailable."); }
  const token = tokenInput.safeParse(data.get("token"));
  if (!token.success) { await clearInvite(); return failed("This invitation is unavailable."); }
  const hash = await hashInvite(token.data), invite = await loadInviteLanding(await getDb(), hash);
  if (!invite || invite.expired) { await clearInvite(); return failed(invite?.expired ? "This invite has expired." : "This invitation is unavailable."); }
  const requestHeaders = await headers();
  const https = requestHeaders.get("origin")?.startsWith("https://") ?? requestHeaders.get("x-forwarded-proto") === "https";
  (await cookies()).set(PENDING_INVITE_COOKIE, hash, {
    httpOnly: true, sameSite: "lax", secure: https, path: "/invite",
    maxAge: Math.max(0, Math.min(INVITE_CONTINUATION_SECONDS, Math.floor((Date.parse(invite.expiresAt) - Date.now()) / 1000))),
  });
  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?returnTo=${encodeURIComponent(INVITE_RETURN_PATH)}`);
  redirect(INVITE_RETURN_PATH);
}

async function clearInvite() {
  (await cookies()).set(PENDING_INVITE_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/invite", maxAge: 0 });
}
async function pendingHash() {
  const value = (await cookies()).get(PENDING_INVITE_COOKIE)?.value;
  return tokenInput.safeParse(value).success ? value! : "";
}

export async function acceptEngagement(_previous: EngagementResult | null, data: FormData): Promise<EngagementResult> {
  const viewer = await requireViewer().catch(() => null);
  if (!viewer) return failed("Sign in again to continue.");
  if (!validForm(data, ["consent", "associate", "displayName", "kind", "city", "registrationNo"])) return failed("Check the supplied fields.");
  const hash = await pendingHash();
  const result = await acceptInvitation(await getDb(), viewer.id, hash, {
    consent: data.get("consent"), associate: data.get("associate"),
    ...(data.has("displayName") ? { displayName: data.get("displayName"), kind: data.get("kind"), city: data.get("city") ?? undefined, registrationNo: data.get("registrationNo") ?? undefined } : {}),
  });
  if (result.ok) {
    await clearInvite();
    revalidatePath("/engagements");
    redirect("/engagements?response=accepted");
  }
  const remaining = hash ? await loadInviteLanding(await getDb(), hash) : null;
  if (!remaining || remaining.expired) await clearInvite();
  return result;
}

export async function declineEngagement(_previous: EngagementResult | null): Promise<EngagementResult> {
  const viewer = await requireViewer().catch(() => null);
  void _previous;
  if (!viewer) return failed("Sign in again to continue.");
  const result = await declineInvitation(await getDb(), viewer.id, await pendingHash());
  await clearInvite();
  if (result.ok) {
    revalidatePath("/engagements");
    redirect("/engagements?response=declined");
  }
  return result;
}

export async function cancelEngagement(_previous: EngagementResult | null, data: FormData): Promise<EngagementResult> {
  const viewer = await requireViewer().catch(() => null);
  if (!viewer) return failed("Sign in again to continue.");
  if (!validForm(data, ["id"])) return failed();
  const result = await cancelInvitation(await getDb(), viewer.id, data.get("id"));
  if (result.ok) revalidatePath("/engagements");
  return result;
}

function validForm(data: FormData, fields: string[]) {
  const seen = new Set<string>();
  for (const [key, value] of data) {
    if (key.startsWith("$ACTION_")) continue;
    if (!fields.includes(key) || seen.has(key) || typeof value !== "string" || value.length > 300) return false;
    seen.add(key);
  }
  return true;
}
