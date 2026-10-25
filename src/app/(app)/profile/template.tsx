import type { ReactNode } from "react";

import { PageEnter } from "@/ui/page-enter";

export default function ProfileTemplate({ children }: { children: ReactNode }) {
  return <PageEnter>{children}</PageEnter>;
}
