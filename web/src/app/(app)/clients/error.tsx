"use client";

export default function RecordsError({ reset }: { reset: () => void }) {
  return (
    <div className="register-panel space-y-3 text-sm">
      <p role="alert">Client records could not be loaded.</p>
      <button type="button" onClick={reset} className="register-secondary">Try again</button>
    </div>
  );
}
