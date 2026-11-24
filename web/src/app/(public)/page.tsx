import Image from "next/image";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { RegisterIcon } from "@/components/register-icon";
import { RecordPreview } from "./record-preview";
import styles from "./landing.module.css";

export default function Landing() {
  return (
    <PageShell
      mainClassName={styles.landing}
      aside={<Link href="/sign-in" className="register-secondary">Sign in <RegisterIcon name="arrow" /></Link>}
    >
      <section className={styles.hero} aria-labelledby="landing-title">
        <Image className={styles.linen} src="/register/signal-linen.webp" alt="" fill sizes="100vw" unoptimized preload />
        <div className={styles.heroInner}>
          <div className={styles.overline}><span /> Private register · Philippines</div>
          <h1 id="landing-title" className={styles.title}>Freelance work,<br className={styles.titleBreak} /> <em>on the record.</em></h1>
          <div className={styles.heroBottom}>
            <p>Keep a record of how clients handle freelance work. Published accounts start with an accepted engagement, supporting proof and human review.</p>
            <Link href="/sign-in" className={styles.enter}>Sign in or create an account <RegisterIcon name="arrow" /></Link>
          </div>
        </div>
      </section>

      <section className={styles.guide} aria-labelledby="guide-title">
        <div className={styles.guideIntro}>
          <p className="register-kicker">How FLAG works</p>
          <h2 id="guide-title">One engagement.<br /> Different audiences.</h2>
          <p>A moderator’s approval changes who can read an account of the work. The supporting files stay private.</p>
        </div>
        <RecordPreview />
      </section>

      <section className={styles.conditions} aria-labelledby="conditions-title">
        <h2 id="conditions-title">Before you can file</h2>
        <dl>
          <div>
            <dt><RegisterIcon name="shield" /> An identity check</dt>
            <dd>Freelancers need an identity check before sending invitations. It establishes identity only.</dd>
          </div>
          <div>
            <dt><RegisterIcon name="invite" /> An accepted invitation</dt>
            <dd>The client chooses whether to consent to logging this engagement. Declining creates no warning or negative signal.</dd>
          </div>
        </dl>
      </section>

      <section className={styles.pilot} aria-labelledby="pilot-heading">
        <h2 id="pilot-heading" className="register-kicker"><RegisterIcon name="info" /> Pilot availability</h2>
        <p>New logs and proof uploads are available only while pilot intake is open. FLAG does not resolve disputes or collect payments.</p>
      </section>
    </PageShell>
  );
}
