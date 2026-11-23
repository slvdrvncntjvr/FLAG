export function RegisterIllustration({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "register-illustration register-illustration--compact" : "register-illustration"} aria-hidden="true">
      <span className="register-sun" />
      <span className="register-hill-light" />
      <span className="register-hill-dark" />
    </div>
  );
}
