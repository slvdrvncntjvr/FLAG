"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { RegisterIcon } from "@/components/register-icon";
import styles from "./landing.module.css";

const stages = [
  {
    name: "Draft",
    audience: "Filer, named client and moderators",
    selection: "Written facts and private proof",
    detail: "The freelancer records what happened on the accepted engagement. The named client can already see the saved draft.",
    proof: "Supporting proof is private",
    icon: "proof",
  },
  {
    name: "In review",
    audience: "Filer, named client and moderators",
    selection: "With a human moderator",
    detail: "The freelancer has submitted the log. Its facts and proof stay private while a moderator reviews them.",
    proof: "Supporting proof is private",
    icon: "queue",
  },
  {
    name: "Published",
    audience: "Named client and eligible signed-in freelancers",
    selection: "An approved experience",
    detail: "The account of the work, the rating and the filer’s name appear in the client record. The named client can request a private correction.",
    proof: "Supporting proof stays private",
    icon: "record",
  },
] as const;

export function RecordPreview() {
  const id = useId();
  const [active, setActive] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function move(event: KeyboardEvent<HTMLButtonElement>) {
    const last = stages.length - 1;
    let next: number;
    switch (event.key) {
      case "ArrowRight": next = (active + 1) % stages.length; break;
      case "ArrowLeft": next = (active + last) % stages.length; break;
      case "Home": next = 0; break;
      case "End": next = last; break;
      default: return;
    }
    event.preventDefault();
    setActive(next);
    buttons.current[next]?.focus();
  }

  return (
    <div className={styles.preview}>
      <div className={styles.previewHeading}>
        <div>
          <p className="register-kicker">Example engagement</p>
          <h3>Brand identity handover</h3>
        </div>
        <RegisterIcon name="record" />
      </div>
      <div className={styles.tabs} role="tablist" aria-label="Example record stage">
        {stages.map(({ name }, index) => (
          <button key={name} id={`${id}-tab-${index}`} role="tab" type="button"
            ref={node => { buttons.current[index] = node; }}
            tabIndex={index === active ? 0 : -1}
            aria-selected={index === active}
            aria-controls={`${id}-panel-${index}`}
            onClick={() => setActive(index)}
            onKeyDown={move}
          >
            {name}
          </button>
        ))}
      </div>
      {stages.map((stage, index) => (
        <div key={stage.name} id={`${id}-panel-${index}`} role="tabpanel" aria-labelledby={`${id}-tab-${index}`}
          hidden={index !== active} tabIndex={0} className={styles.panel}>
          <div>
            <p className="register-kicker">Visible to</p>
            <p className={styles.audience}>{stage.audience}</p>
          </div>
          <div>
            <p className={styles.selection}><RegisterIcon name={stage.icon} /> {stage.selection}</p>
            <p className={styles.detail}>{stage.detail}</p>
          </div>
          <p className={styles.proof}><RegisterIcon name="lock" /> {stage.proof}</p>
        </div>
      ))}
      <noscript>
        <div className={styles.noScript}>
          <p><strong>During review.</strong> The filer, named client and moderators can see the submitted log.</p>
          <p><strong>After publication.</strong> The named client and eligible signed-in freelancers can read the account, rating and filer’s name. Supporting proof stays private.</p>
        </div>
      </noscript>
    </div>
  );
}
