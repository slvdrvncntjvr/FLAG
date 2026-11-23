import type { CSSProperties } from "react";
import { LOG_TAGS } from "@/features/logs/schema";

export type FieldValues = { rating: number; facts: string; tags: string[]; periodStart: string; periodEnd: string; amountCentavos: number | null };
const field = "register-field mt-1 block w-full min-w-0";
const ratingImages = {
  "--rating-dot-empty": "url(/register/update-rating-empty.svg)",
  "--rating-dot-filled": "url(/register/update-rating-filled.svg)",
} as CSSProperties;
const ratingDots = [
  "[--rating-dot:var(--rating-dot-filled)]",
  "group-has-[option:nth-child(n+2):checked]/rating:[--rating-dot:var(--rating-dot-filled)]",
  "group-has-[option:nth-child(n+3):checked]/rating:[--rating-dot:var(--rating-dot-filled)]",
  "group-has-[option:nth-child(n+4):checked]/rating:[--rating-dot:var(--rating-dot-filled)]",
  "group-has-[option:nth-child(n+5):checked]/rating:[--rating-dot:var(--rating-dot-filled)]",
];

export function RevisionFields({ value, filerUpdate = false }: { value: FieldValues; filerUpdate?: boolean }) {
  const facts = <label className="block font-medium">Written facts<textarea name="facts" required minLength={40} maxLength={2000} rows={5} defaultValue={value.facts} className={field} /></label>;

  return <fieldset className="min-w-0 space-y-4 text-sm">
    <legend className="register-kicker mb-2">Proposed log details</legend>
    {filerUpdate && facts}
    <div className="group/rating">
      <label className="block font-medium">Rating<select name="rating" required defaultValue={value.rating} className={field}>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
      {filerUpdate && <div aria-hidden="true" className="mt-3 flex gap-2" style={ratingImages}>{ratingDots.map(fill => <span key={fill} className={`size-[22px] bg-[image:var(--rating-dot,var(--rating-dot-empty))] ${fill}`} />)}</div>}
    </div>
    <fieldset className="min-w-0">
      <legend className="register-kicker mb-2">Factual tags (at least one)</legend>
      <div className="flex flex-wrap gap-2">{LOG_TAGS.map(tag => <label key={tag} className="flex min-h-11 items-center gap-2 rounded-full border border-rule bg-surface px-3 has-checked:bg-tint"><input type="checkbox" name="tags" value={tag} defaultChecked={value.tags.includes(tag)} className="size-4 shrink-0" />{tag}</label>)}</div>
    </fieldset>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block font-medium">Work period start<input name="periodStart" type="date" required defaultValue={value.periodStart} className={field} /></label>
      <label className="block font-medium">Work period end<input name="periodEnd" type="date" required defaultValue={value.periodEnd} className={field} /></label>
    </div>
    <label className="block font-medium">Amount in centavos (optional)<input name="amountCentavos" type="number" min={0} step={1} defaultValue={value.amountCentavos ?? ""} className={field} /></label>
    {!filerUpdate && facts}
    <p className="text-muted">Use facts supported by the proof. Do not include government ID details or unrelated personal information.</p>
  </fieldset>;
}
