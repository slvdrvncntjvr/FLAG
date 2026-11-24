const icons = {
  flag: <path d="M5 21V4m0 1c5-5 9 4 15-1v11c-6 5-10-4-15 1" />,
  arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
  down: <path d="M12 4v15m-6-6 6 6 6-6" />,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
  engagements: <><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M8 6V4h8v2M3 11a23 23 0 0 0 18 0m-9 1v2" /></>,
  profile: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2" /></>,
  record: <><rect x="5" y="3" width="15" height="18" rx="2" /><path d="M8 3v18m3-12h5m-5 4h5" /></>,
  queue: <><path d="M3 14h5l2 3h4l2-3h5M6 5h12l3 9v5H3v-5z" /><path d="M9 9h6" /></>,
  data: <><ellipse cx="12" cy="5.5" rx="8" ry="3" /><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>,
  invite: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>,
  proof: <><path d="m9 12 3-3a3 3 0 0 1 4.2 4.2l-4.8 4.9a4.5 4.5 0 0 1-6.4-6.4l6-6a5.5 5.5 0 1 1 7.8 7.8l-1 1" /></>,
  shield: <><path d="M12 3 20 6v5c0 5-3 8-8 10-5-2-8-5-8-10V6z" /><path d="m8.5 11.5 2.5 2.5 4.5-4.5" /></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 1 1 8 0v3m-4 4v3" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8h.01" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  correction: <><path d="M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6m-2 10 1-4 7-7 3 3-7 7z" /></>,
} satisfies Record<string, React.ReactNode>;

export type RegisterIconName = keyof typeof icons;

export function RegisterIcon({ name, className }: { name: RegisterIconName; className?: string }) {
  return (
    <svg className={className ? `register-icon ${className}` : "register-icon"} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {icons[name]}
    </svg>
  );
}
