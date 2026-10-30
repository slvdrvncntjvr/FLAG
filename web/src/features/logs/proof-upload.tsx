"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { MAX_PROOF_BYTES, MAX_PROOFS } from "./schema";

const field = "mt-1 block w-full min-w-0 rounded-sm border border-rule bg-white px-3 py-3";
const subscribe = () => () => {};
const messengerSnapshot = () => /FBAN|FBAV|Messenger|FB_IAB/i.test(navigator.userAgent);

// A fresh canvas has no source EXIF, GPS, camera or textual metadata. Never fall
// back to the original image bytes if decoding or encoding is unavailable.
export async function prepareProof(file: File): Promise<File> {
  if (!file.size || file.size > MAX_PROOF_BYTES) throw new Error("Choose a file between 1 byte and 10 MiB.");
  // Sniff a bounded prefix so a mislabeled image cannot skip re-encoding by
  // claiming to be a PDF. The server independently validates the full file.
  const prefix = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const starts = (bytes: number[]) => bytes.every((byte, index) => prefix[index] === byte);
  const text = String.fromCharCode(...prefix);
  if (/^%PDF-[12]\.\d/.test(text)) return new File([file], "proof.pdf", { type: "application/pdf" });
  const imageType = starts([137, 80, 78, 71, 13, 10, 26, 10]) ? "image/png"
    : starts([255, 216, 255]) ? "image/jpeg" : text.startsWith("RIFF") && text.slice(8) === "WEBP" ? "image/webp" : null;
  if (!imageType) throw new Error("Choose a PNG, JPEG, WebP or PDF file.");
  const bitmap = await createImageBitmap(new Blob([file], { type: imageType }));
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 24_000_000) throw new Error("Choose an image of at most 24 megapixels.");
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image preparation is unavailable. Open this page in Chrome or Safari and try again.");
    context.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Could not prepare this image. Try another image.")), imageType, 0.9));
    if (!blob.size || blob.size > MAX_PROOF_BYTES) throw new Error("The prepared image exceeds 10 MiB. Choose a smaller image.");
    if (!["image/jpeg", "image/png", "image/webp"].includes(blob.type)) throw new Error("Could not prepare this image. Try another image.");
    return new File([blob], "proof", { type: blob.type });
  } finally { bitmap.close(); }
}

export function ProofUpload({ logId, count, onBusy }: { logId: string; count: number; onBusy?: (busy: boolean) => void }) {
  const router = useRouter();
  const inMessenger = useSyncExternalStore(subscribe, messengerSnapshot, () => false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || !file.size) { setFeedback({ error: true, text: "Choose a proof file." }); return; }
    setBusy(true); onBusy?.(true);
    setFeedback({ error: false, text: "Preparing proof. Keep this page open." });
    try {
      const prepared = await prepareProof(file);
      const body = new FormData();
      body.set("file", prepared);
      body.set("kind", String(data.get("kind")));
      setFeedback({ error: false, text: "Uploading private proof. Keep this page open." });
      const response = await fetch(`/api/logs/${encodeURIComponent(logId)}/proofs`, { method: "POST", body, signal: AbortSignal.timeout(60_000) });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result || typeof result !== "object" || !("ok" in result) || result.ok !== true) throw new Error(response.status === 413 ? "The proof exceeds 10 MiB." : response.status === 429 ? "The daily proof limit has been reached. Try again tomorrow." : response.status === 404 ? "This draft is unavailable. Reload the page." : "Proof could not be uploaded. Reload to check whether it was saved, then retry if needed.");
      form.reset();
      setFeedback({ error: false, text: "Private proof uploaded." });
      router.refresh();
    } catch (error) {
      setFeedback({ error: true, text: error instanceof Error && error.message !== "Failed to fetch" && !["TimeoutError", "AbortError"].includes(error.name) ? error.message : "Upload interrupted. Reload to check whether it was saved, then retry if needed." });
    } finally { setBusy(false); onBusy?.(false); }
  }
  return <section className="mt-8 space-y-4 border-t border-rule pt-6" aria-labelledby="proof-heading">
    <h2 id="proof-heading" className="font-serif text-2xl">Private proof</h2>
    <p>Attach 1–5 files about this engagement. PNG, JPEG, WebP or PDF; at most 10 MiB (10,485,760 bytes) each.</p>
    <p>Proof is available only to you, the named client and moderators. Do not upload government IDs, ID numbers or unrelated personal information. Check PDFs for private metadata before uploading.</p>
    <details open={inMessenger || undefined} className="border-y border-rule py-3"><summary className="cursor-pointer py-2 font-medium">Using Messenger? Open in Chrome</summary><p className="mt-2">Before choosing a file, use Messenger’s menu to open this page in your external browser. Choose Chrome on Android or Safari on iPhone. Sign in there if asked, then return to this draft.</p></details>
    <p className="text-sm">Images are re-encoded on your device to remove location and camera metadata. This does not remove personal information visible in the image.</p>
    <form onSubmit={upload} className="space-y-4" aria-busy={busy}>
      <fieldset disabled={busy || count >= MAX_PROOFS} className="min-w-0 space-y-4">
        <legend className="sr-only">Upload a private proof</legend>
        <label className="block">Proof type<select name="kind" className={field}><option value="screenshot">Screenshot</option><option value="invoice">Invoice</option><option value="agreement">Agreement</option><option value="chat">Chat</option><option value="other">Other</option></select></label>
        <label className="block">Proof file<input name="file" type="file" required accept="image/png,image/jpeg,image/webp,application/pdf" className={`${field} text-sm`} /></label>
        <button className="w-full border border-rule px-4 py-3 disabled:opacity-60" disabled={busy || count >= MAX_PROOFS}>{busy ? "Uploading…" : "Upload private proof"}</button>
      </fieldset>
      {count >= MAX_PROOFS && <p role="status">Five proofs are already attached.</p>}
      {feedback && <p role={feedback.error ? "alert" : "status"}>{feedback.text}</p>}
    </form>
  </section>;
}
