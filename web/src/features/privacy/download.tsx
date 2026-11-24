"use client";
import { useState, useSyncExternalStore } from "react";

const subscribe = () => () => {};

export function ExportDownload() {
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const [pending, setPending] = useState(false), [message, setMessage] = useState("");
  return <form method="post" className="register-panel space-y-4" aria-busy={pending} onSubmit={async e => {
    e.preventDefault(); const form = e.currentTarget, data = new FormData(form);
    const id = String(data.get("deliveryId")), token = String(data.get("token"));
    setPending(true); setMessage("");
    try {
      const response = await fetch(`/api/privacy/exports/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error("unavailable");
      const blob = await response.blob(), url = URL.createObjectURL(blob), anchor = document.createElement("a");
      anchor.href = url; anchor.download = "flag-account-export.json"; anchor.click(); URL.revokeObjectURL(url);
      form.reset(); setMessage("Downloaded. This secret has been consumed and the stored artifact purged.");
    } catch { setMessage("Delivery unavailable, expired, revoked or already used. Contact the privacy processor for a new assessed delivery."); }
    finally { setPending(false); }
  }}>
    <fieldset disabled={!hydrated || pending} className="min-w-0 space-y-4">
      <label className="block text-sm font-medium">Delivery reference
        <input name="deliveryId" required maxLength={100} autoComplete="off" className="register-field mt-2 block w-full" />
      </label>
      <label className="block text-sm font-medium">One-use secret
        <input name="token" type="password" required maxLength={64} autoComplete="off" className="register-field mt-2 block w-full" />
      </label>
      <button type="submit" className="register-primary w-full">{pending ? "Downloading…" : "Download private export"}</button>
    </fieldset>
    <noscript><p className="text-sm text-muted">Enable JavaScript to download your export.</p></noscript>
    <p role="status" className="text-sm text-muted">{message}</p>
  </form>;
}
