"use client";
import { useState } from "react";
export function ExportDownload() {
  const [pending, setPending] = useState(false), [message, setMessage] = useState("");
  return <form className="space-y-4" onSubmit={async e => {
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
  }}><label className="block">Delivery reference<input name="deliveryId" required maxLength={100} autoComplete="off" className="block w-full border p-3" /></label><label className="block">One-use secret<input name="token" type="password" required maxLength={64} autoComplete="off" className="block w-full border p-3" /></label><button disabled={pending} className="min-h-11 bg-ink px-4 py-3 text-paper">{pending ? "Downloading…" : "Download private export"}</button><p role="status">{message}</p></form>;
}
