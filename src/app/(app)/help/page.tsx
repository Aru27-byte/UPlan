import { Card } from "@/ui/card";

// A minimal static page so the sidebar's "Help" nav item isn't a dead link. No backend module
// backs this yet — nothing here is fabricated, it's just contact information.
export default function HelpPage() {
  return (
    <div className="max-w-prose">
      <h1 className="mb-4 text-2xl font-bold">Help</h1>
      <Card color="neutral">
        <p>
          UPlan structures the evidence behind a decision; it never makes the call. If something looks wrong
          in a decision&apos;s evidence, impact, or report, contact UPlan staff before releasing that
          decision&apos;s report.
        </p>
      </Card>
    </div>
  );
}
