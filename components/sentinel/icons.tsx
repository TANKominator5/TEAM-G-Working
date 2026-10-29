import type { CSSProperties } from "react";

export type IconName = "shield" | "activity" | "check" | "challenge" | "block" | "refresh" | "logout" | "arrow" | "chevron" | "clock" | "terminal" | "info" | "lock" | "layers";

export function Icon({ name, size = 20, className = "", style }: { name: IconName; size?: number; className?: string; style?: CSSProperties }) {
  const paths: Record<IconName, React.ReactNode> = {
    shield: <><path d="M12 3 4.5 6v5c0 4.7 3.2 8 7.5 10 4.3-2 7.5-5.3 7.5-10V6L12 3Z" /><path d="m8.5 11.5 2.3 2.3 4.7-5" /></>,
    activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
    check: <><circle cx="12" cy="12" r="8.5" /><path d="m8.5 12 2.3 2.3 4.7-4.7" /></>,
    challenge: <><path d="m12 3 9 17H3L12 3Z" /><path d="M12 9v4m0 3v.1" /></>,
    block: <><circle cx="12" cy="12" r="8.5" /><path d="m6 6 12 12" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1" /></>,
    logout: <><path d="M10 4H5v16h5m5-12 4 4-4 4m-6-4h10" /></>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    chevron: <path d="m9 5 7 7-7 7" />,
    clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></>,
    terminal: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="m7 9 3 3-3 3m6 0h4" /></>,
    info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5m0-8v.1" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></>,
    layers: <><path d="m12 3 10 5-10 5L2 8l10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={style}>{paths[name]}</svg>;
}
