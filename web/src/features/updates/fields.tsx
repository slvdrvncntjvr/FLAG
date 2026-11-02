import { LOG_TAGS } from "@/features/logs/schema";
export type FieldValues = { rating: number; facts: string; tags: string[]; periodStart: string; periodEnd: string; amountCentavos: number | null };
const field = "mt-1 block w-full min-w-0 rounded-sm border border-rule bg-white px-3 py-3";
export function RevisionFields({ value }: { value: FieldValues }) {
  return <fieldset className="min-w-0 space-y-4"><legend className="font-medium">Proposed log details</legend>
    <label className="block">Rating<select name="rating" required defaultValue={value.rating} className={field}>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
    <fieldset><legend>Factual tags (at least one)</legend>{LOG_TAGS.map(tag => <label key={tag} className="flex min-h-11 items-center gap-3"><input type="checkbox" name="tags" value={tag} defaultChecked={value.tags.includes(tag)} />{tag}</label>)}</fieldset>
    <label className="block">Work period start<input name="periodStart" type="date" required defaultValue={value.periodStart} className={field} /></label>
    <label className="block">Work period end<input name="periodEnd" type="date" required defaultValue={value.periodEnd} className={field} /></label>
    <label className="block">Amount in centavos (optional)<input name="amountCentavos" type="number" min={0} step={1} defaultValue={value.amountCentavos ?? ""} className={field} /></label>
    <label className="block">Written facts<textarea name="facts" required minLength={40} maxLength={2000} rows={6} defaultValue={value.facts} className={field} /></label>
    <p className="text-sm">Use facts supported by the proof. Do not include government ID details or unrelated personal information.</p>
  </fieldset>;
}
