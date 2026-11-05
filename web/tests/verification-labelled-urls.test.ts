import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { verificationInput } from "@/features/verification/schema";
import { submitVerification } from "@/features/verification/submit";
import { claimVerification, decideVerification } from "@/features/moderation/handlers";
import { createDb } from "@/server/db";
import { POLICY_VERSIONS, requiredPolicies } from "@/lib/policies";
import { policyAcceptance, user, type Role } from "@/server/db/schema";

const ordinary = { name: "Alex Rivera", city: "Quezon City", portfolioLinks: [{ url: "https://example.invalid/work" }] };
const originalRepros = [
  "https://example.invalid/work?sss_account_number=12-3456789-0",
  "https://example.invalid/work?tin_identification_number=123456789",
  "https://example.invalid/social_security_system_account_number/12-3456789-0",
  "https://example.invalid/work#sss_account_number:12-3456789-0",
];
// Synthetic complete shorter shapes expose the numeric-project exception.
const labelledNumbers = [
  ["tin", "123456789"], ["sss", "12-3456789-0"], ["ssn", "123-45-6789"],
  ["tax_identification_number", "123.456.789"], ["Tax-Payer-Identity-Number", "123456789"],
  ["tax_identifier", "123456789"], ["tax_id", "123456789"],
  ["social_security_number", "123-45-6789"], ["social_security_system_id", "12-3456789-0"],
  ["social_security_account_identifier", "12-3456789-0"],
  ["GSIS", "12345678901"], ["PhilHealth", "12345678901"],
  ["Pag-IBIG_member_ID", "12345678901"], ["HDMF_MID", "12345678901"],
  ["Home_Development_Mutual_Fund_membership_number", "12345678901"],
  ["government_id", "123456789"], ["national_identity_number", "123456789"],
  ["Philippine_identification_system_number", "123456789"],
  ["government_service_insurance_system_number", "12345678901"],
  ["Philippine_health_insurance_corporation_identifier", "12345678901"],
  ["PhilSys_card_number", "123456789"], ["PhilID", "123456789"], ["ePhilID", "123456789"],
  ["passport", "P1234567"], ["driver_licence", "A01-23-456789"],
  ["sss_account_number", "12-3456789-0"], ["tin_identification_number", "123456789"],
  ["social_security_system_account_number", "12-3456789-0"],
  ["social_security_system_member_identification_number", "12-3456789-0"],
  ["SSN_identity_number", "123-45-6789"], ["TIN_account_identifier", "123456789"],
  ["GSIS_membership_id_number", "12345678901"],
  ["government_service_insurance_system_member_number", "12345678901"],
  ["PhilHealth_member_identification_number", "12345678901"],
  ["Philippine_health_insurance_corporation_account_number", "12345678901"],
  ["Pag_IBIG_account_number", "12345678901"], ["Pag_IBIG_fund_member_identity_number", "12345678901"],
  ["HDMF_membership_identification_number", "12345678901"],
  ["Home_Development_Mutual_Fund_account_number", "12345678901"],
  ["PhilSys_card_identification_number", "123456789"], ["ePhilID_identity_number", "123456789"],
  ["national_identification_card_number", "123456789"],
  ["passport_identification_number", "P1234567"], ["driver_license_identity_number", "A01-23-456789"],
  ["s.s.s._account_no", "12-3456789-0"], ["t_i_n_identity_number", "123456789"],
  ["g.s.i.s._membership_number", "12345678901"],
] as const;
const labelledUrls = labelledNumbers.flatMap(([label, number]) => [
  `https://example.invalid/work?project=42&${label}=${number}&page=7`,
  `https://example.invalid/work/${label}/${number}`,
  `https://example.invalid/work#${label}:${number}`,
]);
const encodedUrls = [
  "https://example.invalid/work?%74%69%6e=%31%32%33%34%35%36%37%38%39",
  "https://example.invalid/work?%2574%2569%256e=%2531%2532%2533%2534%2535%2536%2537%2538%2539",
  "https://example.invalid/work?detail=tax%255Fidentification%255Fnumber%253D123%252E456%252E789",
  "https://example.invalid/tax%2520identification%2520number/123%2520456%2520789",
  "https://example.invalid/work#social%2520security%2520number%253A123%252D45%252D6789",
  "https://example.invalid/work?ＴＩＮ=１２３４５６７８９",
  "https://example.invalid/work?ti\u200bn=123\u200b456\u200b789",
  "https://example.invalid/work#ＳＳＳ：１２－３４５６７８９－０",
  "https://example.invalid/so\u200bcial-security-number/١٢٣-٤٥-٦٧٨٩",
  "https://example.invalid/work?detail=TIN%3A%201%EF%B8%8F%E2%83%A32%EF%B8%8F%E2%83%A33%EF%B8%8F%E2%83%A34%EF%B8%8F%E2%83%A35%EF%B8%8F%E2%83%A36%EF%B8%8F%E2%83%A37%EF%B8%8F%E2%83%A38%EF%B8%8F%E2%83%A39%EF%B8%8F%E2%83%A3",
  "https://example.invalid/work?project=123456789&sss=12-3456789-0&other=987654321",
  "https://example.invalid/work#project=123456789&tin=123456789&other=987654321",
  "https://example.invalid/work?%73%73%73%5Faccount%5Fnumber=%31%32%2D3456789%2D0",
  "https://example.invalid/work?detail=sss%255Faccount%255Fnumber%253D12%252D3456789%252D0",
  "https://example.invalid/social%255Fsecurity%255Fsystem%255Faccount%255Fnumber/12%252D3456789%252D0",
  "https://example.invalid/work#sss%255Faccount%255Fnumber%253A12%252D3456789%252D0",
  "https://%73%73%73-account-number-12-3456789-0.example.invalid/work",
  "https://tin-identification-number-123456789.example.invalid/work",
  "https://social-security-system-account-number-12-3456789-0.example.invalid/work",
  "https://example.invalid/work?ＳＳＳ＿ａｃｃｏｕｎｔ＿ｎｕｍｂｅｒ=１２－３４５６７８９－０",
  "https://example.invalid/work#sss\u200b_account_number：١٢—٣٤٥٦٧٨٩—٠",
  "https://example.invalid/social-security-system-account-number/١٢٣·٤٥٦·٧٨٩٠",
  ...Array.from({ length: 5 }, (_, index) => {
    let content = "sss_account_number:12-3456789-0";
    for (let depth = 0; depth <= index; depth++) content = encodeURIComponent(content);
    return `https://example.invalid/work#${content}`;
  }),
  ...Array.from({ length: 4 }, (_, index) => {
    let content = "TIN:123/456/789";
    for (let depth = 0; depth <= index; depth++) content = encodeURIComponent(content);
    return `https://example.invalid/work?detail=${content}`;
  }),
];
// These scripts keep decimal digits through NFKC, but URL.hostname punycodes
// them. Inspecting only the parsed host therefore loses the labelled number.
const unicodeHosts = [
  "sss-account-number-१२-३४५६७८९-०.example.invalid",
  "sss-account-number-၁၂-၃၄၅၆၇၈၉-၀.example.invalid",
];
const specialSchemePrefixes = ["https://", "https:", "https:/", "https:////", "https:\\", "https:\\\\", "https:/\\", "https:\\/"];
const unicodeHostUrls = unicodeHosts.flatMap(host => [host, encodeURIComponent(host)].flatMap(authority =>
  specialSchemePrefixes.map(prefix => `${prefix}${authority}/work`)));
const hostnameRepros = [
  ...unicodeHostUrls,
  " \u0000HTTPS://sss-account-num\tber-१२-३४५६७८९-०.example.invalid/work\r\n ",
  "ht\ttps:\n/\\sss-account-num\rber-၁၂-၃၄၅၆၇၈၉-၀.example.invalid:443/work",
  "https://example.invalid@sss-account-number-१२-३४५६७८९-०.example.invalid/work",
  "https://sss-account-number-१२-३४५६७८९-०.example.invalid?project=123&other=456",
  "https://sss-account-number-၁၂-၃၄၅၆၇၈၉-၀.example.invalid#work",
  "https://१२३४५६७८९०१२.example.invalid/work",
  "https://%E0%A5%A7%E0%A5%A8%E0%A5%A9%E0%A5%AA%E0%A5%AB%E0%A5%AC%E0%A5%AD%E0%A5%AE%E0%A5%AF%E0%A5%A6%E0%A5%A7%E0%A5%A8.example.invalid/work",
];
const deniedUrls = [...originalRepros, ...labelledUrls, ...encodedUrls, ...hostnameRepros];

describe("government-labelled portfolio URLs", () => {
  it.each(originalRepros)("rejects original residual R1 repro in actual schema: %s", url => {
    expect(verificationInput.safeParse({ ...ordinary, portfolioLinks: [{ url }] }).success).toBe(false);
  });

  it.each(deniedUrls)("rejects recognizable labels before the project-number exception: %s", url => {
    expect(verificationInput.safeParse({ ...ordinary, portfolioLinks: [{ url }] }).success).toBe(false);
  });

  it.each([
    "https://www.behance.net/gallery/123456789/Project",
    "https://dribbble.com/shots/12345678-Project",
    ...Array.from({ length: 6 }, (_, i) => `https://example.invalid/project/${"12345678901".slice(0, i + 6)}`),
    "https://example.invalid/work?project=12345678901&other=98765432101#1234567",
    "https://example.invalid/work?tin=design&project=123456789",
    "https://example.invalid/work?project=123456&other=789012&label=tax_identification_number",
    "https://example.invalid/work?label=sss&project=1234567890",
    "https://example.invalid/work?123456=789012&project=12345678901",
    "https://example.invalid/work?tin=123&other=456789&project=12345678901",
    "https://example.invalid/work?sss_account_number=design&project=1234567890",
    "https://example.invalid/work?sss_account_number=123&other=4567890",
    "https://example.invalid/work?sss_account=number&project=1234567890",
    "https://example.invalid/work?label=sss_account_number&project=1234567890",
    "https://example.invalid/work?tin_identification_number=design&project=123456789",
    "https://example.invalid/work?%73ss_account_number=design&project=1234567890",
    "https://example.invalid/work?project_account_number=1234567890&member=1234567",
    "https://example.invalid/work?mysss_account_number=1234567890&notin_identification_number=123456789",
    "https://example.invalid/work?sss_project_number=1234567890",
    "https://example.invalid/work?project_mid=12345678901&contribution=2026",
    "https://example.invalid/work#project=12345678901&other=98765432101",
    "https://example.invalid/work#tin=design&project=123456789",
    "https://example.invalid/social-security-design-2026",
    "https://project-account-number-1234567890.example.invalid/work",
    "https://sss-account-number.example.invalid/project/1234567890",
    "https://example.invalid/caf%C3%A9?project=design+art&year=2026#work",
    "https://café.example.invalid/work?sss_account_number=123&other=4567890",
    "https://caf%C3%A9.example.invalid/work?tin=design&project=123456789",
    "https://xn--caf-dma.example.invalid/work?label=sss_account_number&project=1234567890",
    "https://project-१२३४५६७८९०.example.invalid/work?sss_account_number=design&project=1234567890",
    "https://project-၁၂၃၄၅၆၇၈၉၀.example.invalid:443/work?tin=123&other=456789",
    "https://sss-account-number.example.invalid:12345/work?project=१२३४५६७८९०",
    ...specialSchemePrefixes.map(prefix => `${prefix}café.example.invalid/work?sss_account_number=123&other=4567890`),
    "\u0000HTTPS://ca\tfé.example.invalid/work?sss_account_number=123&other=4567890",
    "ht\ttps:\n/\\café.example.invalid/work?sss_account_number=123&other=4567890",
  ])("preserves legitimate work and independent identifiers exactly: %s", url => {
    const input = { ...ordinary, portfolioLinks: [{ url }] };
    expect(verificationInput.parse(input)).toEqual(input);
  });
});

const db = createDb(env.DB);
async function actor(role: Role) {
  const id = crypto.randomUUID();
  await db.insert(user).values({ id, role, name: "Original Owner", email: `${id}@example.invalid` });
  await db.insert(policyAcceptance).values(requiredPolicies(role).map(policy => ({ id: crypto.randomUUID(), userId: id, policy, version: POLICY_VERSIONS[policy] })));
  return id;
}

// Compare every application table, including immutable history and staff audit
// rows. Table names come only from SQLite's own schema, never submitted input.
async function snapshot() {
  const tables = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' ORDER BY name").all<{ name: string }>();
  const results = await env.DB.batch(tables.results.map(({ name }) => env.DB.prepare(`SELECT * FROM "${name.replace(/"/g, '""')}" ORDER BY rowid`)));
  return results.map(result => result.results);
}

async function assertDeniedWithoutEffects(owner: string) {
  const before = await snapshot();
  const batches = vi.spyOn(db.$client, "batch");
  const logs = (["log", "info", "warn", "error", "debug", "trace"] as const).map(level => vi.spyOn(console, level).mockImplementation(() => {}));
  try {
    for (const url of deniedUrls) {
      expect(await submitVerification(db, owner, { ...ordinary, portfolioLinks: [{ url }] })).toMatchObject({ ok: false, code: "invalid_input" });
      expect(batches).not.toHaveBeenCalled();
      expect(await snapshot()).toEqual(before);
      batches.mockClear();
    }
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  } finally { batches.mockRestore(); for (const log of logs) log.mockRestore(); }
}

it("NT-05: every labelled URL rejects on first submission without any D1 mutation or console output", async () => {
  await assertDeniedWithoutEffects(await actor("freelancer"));
}, 30_000);

it("NT-05: denied corrected requests preserve history; safe resubmission keeps immutable exact snapshots", async () => {
  const owner = await actor("freelancer"), moderator = await actor("moderator");
  const initial = { ...ordinary, portfolioLinks: [{ url: "https://Portfolio.café.example.invalid/caf%C3%A9?sss_account_number=design&project=1234567890#design+art" }] };
  const first = await submitVerification(db, owner, initial);
  if (!first.ok) throw new Error(first.code);
  expect((await env.DB.prepare("SELECT url FROM portfolio_link WHERE freelancer_id = ?").bind(owner).all()).results).toEqual(initial.portfolioLinks);
  const claim = await claimVerification(db, moderator, { caseId: first.moderationCaseId });
  if (!claim.ok) throw new Error(claim.code);
  expect(await decideVerification(db, moderator, { caseId: first.moderationCaseId, expectedClaimUntil: claim.claimUntil, decision: "reject", reason: "Please correct the portfolio" })).toEqual({ ok: true });
  // Read by SQL here to retain every original field, including its frozen JSON.
  const oldRows = await env.DB.prepare("SELECT * FROM verification_case WHERE id = ?").bind(first.verificationCaseId).all();
  await assertDeniedWithoutEffects(owner);
  const corrected = { name: "Corrected Owner", city: "Cebu City", portfolioLinks: [{ url: "https://caf%C3%A9.example.invalid/caf%25C3%25A9?project=12345678901&other=98765432101#work%20samples", label: "Corrected portfolio" }] };
  const second = await submitVerification(db, owner, corrected);
  if (!second.ok) throw new Error(second.code);
  expect((await env.DB.prepare("SELECT url, label FROM portfolio_link WHERE freelancer_id = ?").bind(owner).all()).results).toEqual(corrected.portfolioLinks);
  expect((await env.DB.prepare("SELECT * FROM verification_case WHERE id = ?").bind(first.verificationCaseId).all()).results).toEqual(oldRows.results);
  for (const [id, form] of [[first.verificationCaseId, initial], [second.verificationCaseId, corrected]] as const) {
    const stored = await env.DB.prepare("SELECT submitted_profile FROM verification_case WHERE id = ?").bind(id).first<{ submitted_profile: string }>();
    expect(JSON.parse(stored!.submitted_profile)).toEqual(form);
    await expect(env.DB.prepare("UPDATE verification_case SET submitted_profile = ? WHERE id = ?").bind("{}", id).run()).rejects.toThrow(/immutable/);
  }
}, 30_000);
