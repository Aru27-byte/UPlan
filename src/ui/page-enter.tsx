import type { ReactNode } from "react";

// The short fade-up a page plays when navigation swaps it in (globals.css, `.page-enter`). A route's
// template.tsx wraps its page in this so the shell above it — the navigation rail, or a project's frame and
// stage rail — stays put and only the content being replaced moves. Off for anyone who asks for reduced motion.
export function PageEnter({ children }: { children: ReactNode }) {
  return <div className="page-enter flex flex-col gap-6">{children}</div>;
}
