export function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
      style={{
        transform: open ? "rotate(90deg)" : "rotate(0deg)",
        transition: "transform var(--dur-fast) var(--ease-mech)",
      }}
    >
      <path d="M3 1.5L7 5L3 8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ExternalLinkIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path
        d="M3 2H2.5C2.22386 2 2 2.22386 2 2.5V7.5C2 7.77614 2.22386 8 2.5 8H7.5C7.77614 8 8 7.77614 8 7.5V7M6 2H8V4M8 2L4.5 5.5"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LampDot({ size = 8 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" aria-hidden="true">
      <circle cx="4" cy="4" r="4" fill="currentColor" />
    </svg>
  );
}

export function ArrowRightIcon() {
  return (
    <svg width="12" height="10" viewBox="0 0 14 10" fill="none" aria-hidden="true">
      <path d="M1 5H13M13 5L9 1M13 5L9 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
