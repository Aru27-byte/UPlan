import { PageHeader } from "@/ui/page-header";
import { Panel } from "@/ui/panel";

// The workflow in plain words, for someone opening UPlan for the first time. Static: nothing here reads a
// record. The full description is in Requirements/research-phases.md and Requirements/research-changes.md.
const PHASES = [
  ["Site", "Draw, upload, or load the study area: the district, corridor, or habitat area assessed as a whole."],
  ["Evidence", "The public data mapped over the study area, with the facts behind each source's confidence, and both sources wherever two disagree."],
  ["Screening", "What the mapped data says is in, and near, the study area. A screen flags reasons to look closer; it is never a finding."],
  ["Studies", "Which studies the city's rules name, and which of them mapped data flags. The city decides which studies an application needs."],
  ["Footprint", "Trace what the proposal would clear, grade, or build."],
  ["Impact", "What the footprint would remove or disturb, for each regulated resource and buffer, measured against the evidence."],
] as const;

export default function HelpPage() {
  return (
    <>
      <PageHeader title="Help" meta="How research works in UPlan." />

      <Panel title="What UPlan does">
        <p className="max-w-prose text-sm text-text">
          UPlan structures the evidence behind a decision; it never makes the call. It shows what the public record says,
          where that record is thin or old, and what a proposal would touch. It never recommends developing or
          preserving, and it never drafts a condition of approval.
        </p>
      </Panel>

      <Panel title="A project moves through six phases" description="Each phase has a drafted output. You review it, or change what it is drafted from and read the new draft.">
        <ol className="flex flex-col gap-3 text-sm">
          {PHASES.map(([name, text], index) => (
            <li key={name} className="flex gap-3">
              <span className="w-5 shrink-0 font-semibold text-muted">{index + 1}.</span>
              <span className="text-text">
                <span className="font-semibold">{name}.</span> {text}
              </span>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel title="Drafted output and your review">
        <ul className="flex max-w-prose list-disc flex-col gap-2 pl-5 text-sm text-text">
          <li>UPlan&apos;s analysis engine drafts each phase from measurements, using fixed templates. No language model writes it, and a draft never states an opinion about the development.</li>
          <li>A review records that you read that exact output. If an input changes and the output changes, the phase asks for a new review; an output that didn&apos;t change keeps its review.</li>
          <li>To ask for a change, choose “Request a revision”, say what needs work, change an input, and read the new draft.</li>
          <li>A review is your own record. It is not sign-off, and it says nothing about the development.</li>
        </ul>
      </Panel>

      <Panel title="Finishing, and changing finished research">
        <ul className="flex max-w-prose list-disc flex-col gap-2 pl-5 text-sm text-text">
          <li><span className="font-semibold">Finish research</span> is available once every phase is reviewed. UPlan generates one final document, stores it with its hash, and numbers it version 1.</li>
          <li>A published version never changes. To update completed research, choose <span className="font-semibold">Re-research</span>: upload new data, or go to any phase and change what feeds it. UPlan then shows what your change touched and asks you to review only those phases.</li>
          <li>Finishing a research change publishes the next version with your reason. Every version stays in the history, each with what changed and its own download.</li>
          <li><span className="font-semibold">Delete research</span> removes a project from your lists. UPlan keeps its records.</li>
        </ul>
      </Panel>

      <Panel title="Sample data">
        <p className="max-w-prose text-sm text-text">
          “Start with sample data” creates a project on a fictional site, so you can work through every phase. Anything
          built from sample data is labeled as sample data wherever it appears, including on the cover of the final
          document.
        </p>
      </Panel>

      <Panel title="If something looks wrong">
        <p className="max-w-prose text-sm text-text">
          If a project&apos;s evidence, impact, or document looks wrong, contact UPlan staff before you rely on it.
        </p>
      </Panel>
    </>
  );
}
