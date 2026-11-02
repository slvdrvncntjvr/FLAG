"use client";

export default function RecordsError({ reset }: { reset: () => void }) {
  return <div role="alert"><p>Client records could not be loaded.</p>
    <button type="button" onClick={reset} className="mt-4 min-h-11 border border-ink px-4 py-2">Try again</button>
  </div>;
}
