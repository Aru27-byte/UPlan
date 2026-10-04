import { Suspense, type ReactNode } from "react";

import { PageSkeleton } from "@/ui/page-skeleton";

import { ProjectFrame } from "./_components/project-frame";

// The frame of every project page (TechDesign/decision-overview.md, "Layout"). It does no reading itself:
// the project's header, banners, and stage rail stream in from ProjectFrame behind a Suspense boundary, and
// the page streams in below it from its own. Without that, a layout that awaits the project's records blocks
// the whole navigation into a project until every one of them has been read — Next.js can't show a
// loading.tsx for a layout's own reads. The page and the frame both ask loadProject for the project in one
// request and share one read.
export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  return (
    <div className="flex flex-col gap-5">
      <Suspense fallback={<PageSkeleton header body={false} />}>
        <ProjectFrame projectId={projectId} />
      </Suspense>
      {children}
    </div>
  );
}
