"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import { requestVerification } from "./actions";
import { ActionFeedback, recoverAction } from "./action-feedback";
import type { ReviewResult } from "./schema";

type LinkInput = { url: string; label: string };
const inputStyle = "register-field mt-1 block w-full";

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
    <form action={action} className="mt-5 space-y-4 text-sm" aria-busy={pending}>
      <fieldset disabled={pending || state?.ok === true} className="min-w-0 space-y-4">
        <legend className="font-serif text-lg font-semibold">Request identity verification</legend>
        <p className="mt-1 text-muted">Enter your account/profile name and at least one portfolio link. These stay fixed while your request is under review.</p>
        <label className="block font-medium" htmlFor="verification-name">Account/profile name
          <input id="verification-name" name="name" required maxLength={160} autoComplete="name" value={ownerName} onChange={e => setOwnerName(e.target.value)} className={inputStyle} />
        </label>
        <label className="block font-medium" htmlFor="verification-city">City (optional)
          <input id="verification-city" name="city" maxLength={160} autoComplete="address-level2" value={ownerCity} onChange={e => setOwnerCity(e.target.value)} className={inputStyle} />
        </label>
        <fieldset className="min-w-0 space-y-3 border-b border-rule pb-2">
          <legend className="register-kicker">Portfolio links</legend>
          <p className="mt-1 text-muted">Use public http or https links to your work. Do not link to identity documents.</p>
          {portfolio.map((link, index) => (
            <div key={index} className="space-y-3">
              <label className="block font-medium" htmlFor={`portfolio-url-${index}`}>Portfolio URL {index + 1}
                <span className="relative mt-1 block">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                    <Image src="/register/portfolio-link.svg" width={20} height={20} alt="" unoptimized />
                  </span>
                  <input id={`portfolio-url-${index}`} name="portfolioUrl" type="url" required maxLength={2048} value={link.url} onChange={e => updateLink(index, "url", e.target.value)} className="register-field block w-full pl-10!" />
                </span>
              </label>
              <label className="block font-medium" htmlFor={`portfolio-label-${index}`}>Link label {index + 1} (optional)
                <input id={`portfolio-label-${index}`} name="portfolioLabel" maxLength={100} value={link.label} onChange={e => updateLink(index, "label", e.target.value)} className={inputStyle} />
              </label>
              {portfolio.length > 1 && <button type="button" onClick={() => setPortfolio(current => current.filter((_, i) => i !== index))} className="min-h-11 text-danger underline underline-offset-2 disabled:opacity-60">Remove link {index + 1}</button>}
            </div>
          ))}
          {portfolio.length < 10 && (
            <button type="button" onClick={() => setPortfolio(current => [...current, { url: "", label: "" }])} className="inline-flex min-h-11 items-center gap-2 font-semibold text-accent underline-offset-2 hover:underline disabled:opacity-60">
              <span className="grid size-[1.875rem] shrink-0 place-items-center rounded-full border border-ink bg-coupon">
                <Image src="/register/portfolio-add.svg" width={21} height={21} alt="" unoptimized />
              </span>
              Add portfolio link
            </button>
          )}
        </fieldset>
        <div className="register-callout flex items-center gap-3 border-accent! bg-[#ddefe8]! text-accent">
          <Image src="/register/identity-shield.svg" width={26} height={26} alt="" className="shrink-0" unoptimized />
          <div>
            <p className="font-semibold">Live ID inspection</p>
            <p className="mt-1 text-xs leading-relaxed">A moderator will inspect a supported government ID live. Do not send an ID image, number, recording or QR data through this form.</p>
          </div>
        </div>
        <button type="submit" className="register-primary sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] w-full text-base">
          {pending ? "Submitting request…" : "Submit verification request"}
        </button>
      </fieldset>
      {state && <div className="register-panel"><ActionFeedback state={state} success="Request submitted. Your status is pending review." /></div>}
    </form>
  );
}
