import type { ReactNode } from "react";

import { PageEnter } from "@/ui/page-enter";

// Sits below the project layout, so the project's header, banners, and stage rail stay put while the phase
// page being navigated to fades in.
export default function ProjectTemplate({ children }: { children: ReactNode }) {
  return <PageEnter>{children}</PageEnter>;
}
