import { PageSkeleton } from "@/ui/page-skeleton";

// Shown the moment a link inside the signed-in app is clicked, while the next page reads its records
// (Next.js "loading.js": prefetched with the link, so the navigation is immediate). The navigation shell is
// the layout above this file and stays on screen. Every page under (app) gets it; the project pages have
// their own below, because there the project's header and stage rail stay too.
export default function Loading() {
  return <PageSkeleton header />;
}
