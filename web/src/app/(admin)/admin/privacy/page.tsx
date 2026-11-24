import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedViewer } from "@/server/auth/guards";
import { getDb } from "@/server/db";
import { privacyDashboard } from "@/server/db/queries/privacy";
import { PrivacyForm } from "@/features/privacy/forms";
const fieldClass = "register-field block w-full";

export default async function PrivacyPage() {
  const viewer = await requireOnboardedViewer(), db = await getDb();
  const dashboard = await privacyDashboard(db, viewer.id); if (!dashboard) notFound();
  const accounts = await db.$client.prepare("SELECT id,name,email FROM user ORDER BY created_at DESC LIMIT 200").all<{ id: string; name: string; email: string }>();
  const admins = await db.$client.prepare("SELECT id FROM pilot_live_staff WHERE role='admin'").all<{ id: string }>();
  return <>
    <h1 className="font-serif text-2xl">Privacy processing</h1>
    <p className="mt-2 text-sm text-muted">Record requests received through the named privacy contact. Verify account control without collecting ID documents or numbers. Requests and blocked work remain visible until their assessed actions are verified.</p>
    <PrivacyForm operation="record" label="Record request">
      <label>Subject account<select name="subjectUserId" required className={fieldClass}>{accounts.results.map(a => <option key={a.id} value={a.id}>{a.name} ({a.email})</option>)}</select></label>
      <label>Responsible processor<select name="responsibleId" defaultValue={viewer.id} className={fieldClass}>{admins.results.map(a => <option key={a.id}>{a.id}</option>)}</select></label>
      <label>Kind<select name="kind" className={fieldClass}>{["closure", "export", "deletion", "correction"].map(x => <option key={x}>{x}</option>)}</select></label>
      <label>Prior deferred request reference (follow-up only)<input name="priorRequestId" maxLength={100} className={fieldClass} /></label>
      <label>Received (UTC)<input name="receivedAt" type="datetime-local" required className={fieldClass} /></label><label>Due (UTC; closure within 30 days)<input name="dueAt" type="datetime-local" required className={fieldClass} /></label>
    </PrivacyForm>
    <DashboardSection title="Requests (first 100 by deadline)">
      <ul>{dashboard.requests.map(p => (
        <li key={p.id}>
          <Link href={`/admin/privacy/${p.id}`} className="font-semibold text-accent underline underline-offset-4">{p.kind} · {p.id}</Link>
          <p className="mt-1 text-muted">{p.status} · due {p.due_at}{p.due_at < new Date().toISOString() && !p.closed_at ? " · OVERDUE" : ""}{!p.responsible_id ? " · UNASSIGNED" : ""}</p>
        </li>
      ))}</ul>
    </DashboardSection>
    <DashboardSection title="Material past its retention deadline">
      <p className="text-muted">Counts include held objects and objects awaiting the next bounded batch. Holds delay destruction only.</p>
      <ul>{dashboard.due.map((t, i) => <li key={i}>{String(t.target_type)}: {String(t.count)}</li>)}</ul>
    </DashboardSection>
    <DashboardSection title="Maintenance backlog">
      <PrivacyForm operation="retry" label="Retry settled blocked work and run next bounded batch" />
      <ul>{dashboard.tasks.map((t, i) => <li key={i}>{String(t.target_type)} · {String(t.target_id)} · {String(t.operation)} · {String(t.status)} · due {String(t.due_at)} · attempts {String(t.attempts)}</li>)}</ul>
    </DashboardSection>
    <DashboardSection title="Holds requiring review">
      <ul>{dashboard.holds.map((h, i) => <li key={i}>{String(h.target_type)} · {String(h.target_id)} · review {String(h.review_due_at)} · expires {String(h.expires_at)}<PrivacyForm operation="releaseHold" label="Release this hold"><input name="holdId" type="hidden" value={String(h.id)} /></PrivacyForm></li>)}</ul>
    </DashboardSection>
    <DashboardSection title="Unverified backup dispositions">
      <ul>{dashboard.backups.map((b, i) => <li key={i}>{String(b.backup_ref)} · {String(b.action)} · due {String(b.due_at)}</li>)}</ul>
    </DashboardSection>
    <DashboardSection title="Export preparation in progress">
      <p className="text-muted">Unresolved preparation keeps its private artifact tracked. Investigate interrupted work before releasing its ownership; retry never takes over a writer by elapsed time.</p>
      <ul>{dashboard.writers.map((w, i) => <li key={i}><Link className="font-semibold text-accent underline underline-offset-4" href={`/admin/privacy/${String(w.privacy_request_id)}`}>Request {String(w.privacy_request_id)}</Link> · delivery {String(w.id)} · started {String(w.created_at)} · expires {String(w.expires_at)}</li>)}</ul>
    </DashboardSection>
    <DashboardSection title="Proof uploads in progress">
      <p className="text-muted">Unresolved uploads keep exact private storage tracking. Maintenance waits for their original writer to settle.</p>
      <ul>{dashboard.proofWriters.map((w, i) => <li key={i}>Proof {String(w.id)} · log {String(w.log_id)} · started {String(w.uploaded_at)}</li>)}</ul>
    </DashboardSection>
    <details className="register-panel mt-6 text-sm"><summary className="cursor-pointer font-semibold">Categories needing individual purpose assessment</summary><ul className="mt-3 space-y-2">{dashboard.unassessed.map((u, i) => <li key={i}>{String(u.target_type)}: {String(u.count)}</li>)}</ul></details>
  </>;
}

function DashboardSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="register-staff-section space-y-2 text-sm">
    <h2 className="font-serif text-xl">{title}</h2>
    {children}
  </section>;
}
