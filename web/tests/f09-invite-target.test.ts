import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookie: { get: vi.fn(), set: vi.fn() },
  viewer: vi.fn(), invite: vi.fn(), accept: vi.fn(), decline: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => mocks.cookie, headers: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/db", () => ({ getDb: async () => ({}) }));
vi.mock("@/server/auth/guards", () => ({ requireViewer: mocks.viewer, getViewer: mocks.viewer, requireVerifiedFreelancer: mocks.viewer }));
vi.mock("@/server/db/queries/engagements", () => ({ loadInviteForClient: mocks.invite, loadInviteLanding: vi.fn() }));
vi.mock("@/features/engagements/handlers", () => ({ acceptInvitation: mocks.accept, declineInvitation: mocks.decline, createInvitation: vi.fn(), cancelInvitation: vi.fn() }));
import { acceptEngagement, declineEngagement } from "@/features/engagements/actions";

const hash = "b".repeat(64);
function form(id: string | null) {
  const data = new FormData();
  if (id !== null) data.set("engagementId", id);
  data.set("consent", "on"); data.set("associate", "on");
  return data;
}
describe("rendered invite target action boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.viewer.mockResolvedValue({ id: "client" });
    mocks.cookie.get.mockReturnValue({ value: hash });
    mocks.invite.mockResolvedValue({ id: "invite-B" });
    mocks.accept.mockResolvedValue({ ok: true }); mocks.decline.mockResolvedValue({ ok: true });
  });
  for (const response of ["accept", "decline"] as const) {
    async function submit(id: string | null) {
      const data = form(id);
      if (response === "decline") { data.delete("consent"); data.delete("associate"); }
      return response === "accept" ? acceptEngagement(null, data) : declineEngagement(null, data);
    }
    for (const target of ["invite-A", null, "bad target!"]) {
      it(`${response} rejects stale/missing/malformed target ${target} without mutation or cookie clearing`, async () => {
        expect((await submit(target)).ok).toBe(false);
        expect(mocks.accept).not.toHaveBeenCalled(); expect(mocks.decline).not.toHaveBeenCalled();
        expect(mocks.cookie.set).not.toHaveBeenCalled();
      });
    }
    it(`${response} allows the matching live target with the cookie capability`, async () => {
      await expect(submit("invite-B")).rejects.toThrow(`redirect:/engagements?response=${response === "accept" ? "accepted" : "declined"}`);
      expect(response === "accept" ? mocks.accept : mocks.decline).toHaveBeenCalledWith({}, "client", hash, ...(response === "accept" ? [{ consent: "on", associate: "on" }] : []));
      expect(mocks.cookie.set).toHaveBeenCalledTimes(1);
    });
    it(`${response} cannot use an ID without a live cookie-resolved invite`, async () => {
      mocks.invite.mockResolvedValue(null);
      expect((await submit("invite-B")).ok).toBe(false);
      expect(mocks.accept).not.toHaveBeenCalled(); expect(mocks.decline).not.toHaveBeenCalled();
      expect(mocks.cookie.set).not.toHaveBeenCalled();
    });
    for (const cookie of [undefined, { value: "malformed" }]) {
      it(`${response} rejects a matching ID with missing/malformed cookie`, async () => {
        mocks.cookie.get.mockReturnValue(cookie);
        expect((await submit("invite-B")).ok).toBe(false);
        expect(mocks.invite).not.toHaveBeenCalled();
        expect(mocks.accept).not.toHaveBeenCalled(); expect(mocks.decline).not.toHaveBeenCalled();
        expect(mocks.cookie.set).not.toHaveBeenCalled();
      });
    }
    it(`${response} rejects duplicate target fields without mutation`, async () => {
      const data = new FormData();
      data.append("engagementId", "invite-A"); data.append("engagementId", "invite-B");
      const result = response === "accept" ? await acceptEngagement(null, data) : await declineEngagement(null, data);
      expect(result.ok).toBe(false);
      expect(mocks.accept).not.toHaveBeenCalled(); expect(mocks.decline).not.toHaveBeenCalled();
      expect(mocks.cookie.set).not.toHaveBeenCalled();
    });
  }
  it("stale acceptance with first-profile fields never reaches profile/consent mutation", async () => {
    const data = form("invite-A");
    data.set("displayName", "New client"); data.set("kind", "individual");
    data.set("city", "Quezon City"); data.set("registrationNo", "");
    expect((await acceptEngagement(null, data)).ok).toBe(false);
    expect(mocks.accept).not.toHaveBeenCalled(); expect(mocks.decline).not.toHaveBeenCalled();
    expect(mocks.cookie.set).not.toHaveBeenCalled();
  });
});
