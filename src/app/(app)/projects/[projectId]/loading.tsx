import { PageSkeleton } from "@/ui/page-skeleton";

// Shown when someone moves between a project's stages. The project's header and stage rail belong to the
// layout, which doesn't re-render for a move between sibling stages, so they stay on screen and only the
// stage's own content is a placeholder — hence no page-title skeleton here.
export default function Loading() {
  return <PageSkeleton />;
}
