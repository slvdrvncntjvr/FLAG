"use client";

import { useActionState, useState } from "react";
import { requestVerification } from "./actions";
import { ActionFeedback, buttonStyle, inputStyle, recoverAction } from "./action-feedback";
import type { ReviewResult } from "./schema";

type LinkInput = { url: string; label: string };

export function VerificationRequestForm({ name, city, links }: { name: string; city: string; links: LinkInput[] }) {
  const [ownerName, setOwnerName] = useState(name);
  const [ownerCity, setOwnerCity] = useState(city);
  const [portfolio, setPortfolio] = useState(links.length ? links : [{ url: "", label: "" }]);
  const [state, action, pending] = useActionState<ReviewResult | null, FormData>(
    (previous, form) => recoverAction(requestVerification, previous, form), null,
  );
  function updateLink(index: number, field: keyof LinkInput, value: string) {
    setPortfolio(current => current.map((link, i) => i === index ? { ...link, [field]: value } : link));
  }
  return (
    <form action={action} className="mt-8 space-y-6" aria-busy={pending}>
      <fieldset disabled={pending || state?.ok === true} className="min-w-0 space-y-6">
        <legend className="font-medium">Request identity verification</legend>
        <p className="mt-2 text-muted">Enter your account/profile name and at least one portfolio link. These stay fixed while your request is under review.</p>
        <label className="block" htmlFor="verification-name">Account/profile name
          <input id="verification-name" name="name" required maxLength={160} autoComplete="name" value={ownerName} onChange={e => setOwnerName(e.target.value)} className={inputStyle} />
        </label>
        <label className="block" htmlFor="verification-city">City (optional)
          <input id="verification-city" name="city" maxLength={160} autoComplete="address-level2" value={ownerCity} onChange={e => setOwnerCity(e.target.value)} className={inputStyle} />
        </label>
        <fieldset className="min-w-0 space-y-5">
          <legend className="font-medium">Portfolio links</legend>
          <p className="mt-2 text-muted">Use public http or https links to your work. Do not link to identity documents.</p>
          {portfolio.map((link, index) => (
            <div key={index} className="space-y-3 border-t border-rule pt-4">
              <label className="block" htmlFor={`portfolio-url-${index}`}>Portfolio URL {index + 1}
                <input id={`portfolio-url-${index}`} name="portfolioUrl" type="url" required maxLength={2048} value={link.url} onChange={e => updateLink(index, "url", e.target.value)} className={inputStyle} />
              </label>
              <label className="block" htmlFor={`portfolio-label-${index}`}>Link label {index + 1} (optional)
                <input id={`portfolio-label-${index}`} name="portfolioLabel" maxLength={100} value={link.label} onChange={e => updateLink(index, "label", e.target.value)} className={inputStyle} />
              </label>
              {portfolio.length > 1 && <button type="button" onClick={() => setPortfolio(current => current.filter((_, i) => i !== index))} className="min-h-11 underline">Remove link {index + 1}</button>}
            </div>
          ))}
          {portfolio.length < 10 && <button type="button" onClick={() => setPortfolio(current => [...current, { url: "", label: "" }])} className="min-h-11 underline">Add portfolio link</button>}
        </fieldset>
        <p className="text-muted">A moderator will inspect a supported government ID live. Do not send an ID image, number, recording or QR data through this form.</p>
        <button type="submit" className={`${buttonStyle} sticky bottom-4 w-full`}>
          {pending ? "Submitting request…" : "Submit verification request"}
        </button>
      </fieldset>
      <ActionFeedback state={state} success="Request submitted. Your status is pending review." />
    </form>
  );
}
