import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SubmittedProfile } from "@/features/verification/status";

const submitted = { name: "Original Owner", city: "Original City", portfolioLinks: [{ url: "https://example.com/12345678", label: "Original project" }] };
const current = { name: "Current Owner", city: "Current City", portfolioLinks: [{ url: "https://example.com/current", label: "Current project" }] };

it("renders the original submission and omits mutable current values from a snapshotted case", () => {
  const html = renderToStaticMarkup(createElement(SubmittedProfile, { submitted, current }));
  for (const value of [submitted.name, submitted.city, submitted.portfolioLinks[0].url, submitted.portfolioLinks[0].label]) expect(html).toContain(value);
  for (const value of [current.name, current.city, current.portfolioLinks[0].url, current.portfolioLinks[0].label]) expect(html).not.toContain(value);
});
it("displays unavailable originals without today's data for a decided legacy case", () => {
  const html = renderToStaticMarkup(createElement(SubmittedProfile, { submitted: null, current: null }));
  expect(html).toContain("Original submitted profile unavailable");
  expect(html).toContain("The original inputs cannot be shown for this request");
  expect(html).not.toContain("Account/profile name");
  expect(html).not.toContain("Owner-submitted portfolio");
  expect(html).not.toContain("Current profile");
});
it("clearly separates current values for a fresh undecided legacy inspection", () => {
  const html = renderToStaticMarkup(createElement(SubmittedProfile, { submitted: null, current }));
  expect(html).toContain("Original submitted profile unavailable");
  expect(html).toContain("Current profile — for fresh inspection");
  expect(html).toContain("cannot establish what was submitted or inspected previously");
  expect(html).toContain("Current account/profile name");
  expect(html).toContain(current.portfolioLinks[0].url);
  expect(html).not.toContain("Owner-submitted portfolio");
});
