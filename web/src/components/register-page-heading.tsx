import type { ReactNode } from "react";

export function RegisterPageHeading({ title, label, id, children, action }: {
  title: string;
  label?: string;
  id?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="register-page-heading">
      <div>
        {label && <p className="register-kicker font-mono">{label}</p>}
        <h1 id={id}>{title}</h1>
        {children}
      </div>
      {action}
    </div>
  );
}
