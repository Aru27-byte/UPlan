import { redirect } from "next/navigation";

// The dashboard is the one place research is listed (TechDesign/project-dashboard.md).
export default function ProjectsIndexPage() {
  redirect("/dashboard");
}
