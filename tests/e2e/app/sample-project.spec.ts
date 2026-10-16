import {
  PHASES,
  PHASE_TITLE,
  STAGES,
  VERDICT_PHRASES,
  expectNoAxeViolations,
  stageLink,
} from "../support/app";
import { expect, test } from "../support/fixtures";

// Every step of a project that has data: the sample project, analysed once per worker by the worker-scoped
// fixture and never changed by anything here (the specs that review or edit use their own project; see
// reviews.spec.ts). This needs the worker running (npm run worker:dev) and the seeded sample evidence.
//
// What these specs hold the pages to is the charter's posture: provenance on every figure (P1), no clearance and
// no verdict (P2), and plain statements of what desk analysis cannot see.

test.describe("the sample project's frame", () => {
  test("F23 R3: it is labelled as sample data in the header and in a note, so it can't pass for real work", async ({
    page,
    sharedSampleProject,
  }) => {
    await page.goto(`/projects/${sharedSampleProject.id}/overview`);

    const header = page.getByRole("heading", { level: 1 }).locator("xpath=ancestor::header[1]");
    await expect(header.getByText("Sample data")).toBeVisible();
    await expect(page.getByRole("note")).toContainText("This project uses sample data.");
    await expect(page.getByRole("note")).toContainText("nothing here describes a real place");
  });

  test("F18 R7: once the worker has finished, the frame shows no pending-analysis banner", async ({
    page,
    sharedSampleProject,
  }) => {
    await page.goto(`/projects/${sharedSampleProject.id}/overview`);

    await expect(
      page.getByRole("status").filter({ hasText: /Analysis is (running|out of date)/ }),
    ).toHaveCount(0);
    await expect(page.getByRole("alert").filter({ hasText: "Analysis failed" })).toHaveCount(0);
  });

  test("F18 R2: with an analysis, all six phases need the planner's review and the rail says so in words", async ({
    page,
    sharedSampleProject,
  }) => {
    await page.goto(`/projects/${sharedSampleProject.id}/overview`);

    for (const phase of PHASES)
      await expect(stageLink(page, PHASE_TITLE[phase])).toContainText("Needs review");
    await expect(stageLink(page, "Report")).toContainText("Not ready");
  });
});

test.describe("the Overview with an analysis", () => {
  test("F18 R5: it names what is known, what is not, and the rules that applied, each with its source", async ({
    page,
    sharedSampleProject,
  }) => {
    await page.goto(`/projects/${sharedSampleProject.id}/overview`);

    const known = page.locator("details", { has: page.getByRole("heading", { name: "What do we know?" }) });
    await expect(known.locator("summary")).toContainText(/\d+ resource types? (has|have) mapped evidence\./);
    const unknown = page.locator("details", {
      has: page.getByRole("heading", { name: "What don't we know?" }),
    });
    await expect(unknown.locator("summary")).toContainText(
      /\d+ gaps?, \d+ open disagreements?, and what desk analysis can't see\./,
    );
    await unknown.locator("summary").click();
    await expect(unknown.getByRole("listitem").first()).toBeVisible();

    const rules = page.locator("details", { has: page.getByRole("heading", { name: "Rules that apply" }) });
    await rules.locator("summary").click();
    await expect(rules.getByText(/buffer —|within .+ —/).first()).toBeVisible();
  });

  test("F18, P1: the assumptions state the date each rule set was resolved for", async ({
    page,
    sharedSampleProject,
  }) => {
    await page.goto(`/projects/${sharedSampleProject.id}/overview`);
    const assumptions = page.locator("details", {
      has: page.getByRole("heading", { name: "Assumptions the analysis made" }),
    });
    await assumptions.locator("summary").click();

    await expect(assumptions).toContainText(/Critical area rules were resolved for \d{4}-\d{2}-\d{2}/);
    await expect(assumptions).toContainText(/Tree rules were resolved for \d{4}-\d{2}-\d{2}/);
  });

  test("P2: what desk analysis cannot settle says a screen can add a study and never removes one", async ({
    page,
    sharedSampleProject,
  }) => {
    await page.goto(`/projects/${sharedSampleProject.id}/overview`);
    const section = page.locator("details", {
      has: page.getByRole("heading", { name: "What can desk analysis not settle?" }),
    });

    await expect(section.locator("summary")).toContainText(
      "A screen can add a study, and never removes one.",
    );
  });
});

test.describe("each step shows a drafted output, built from measurements", () => {
  for (const phase of PHASES) {
    test(`research-phases R1, R13: ${PHASE_TITLE[phase]} shows a headline and sentences, and says no language model wrote them`, async ({
      page,
      sharedSampleProject,
    }) => {
      await page.goto(`/projects/${sharedSampleProject.id}/${phase}`);

      const drafted = page.locator("details", { has: page.getByRole("heading", { name: "Drafted output" }) });
      await expect(drafted.locator("summary")).not.toContainText(/This phase needs a/);
      await drafted.locator("summary").click();
      await expect(drafted).toContainText(
        "UPlan's analysis engine drafts this from the phase's inputs. No language model wrote it.",
      );
      expect(await drafted.locator("li").count()).toBeGreaterThan(0);

      const review = page.locator("section", { has: page.getByRole("heading", { name: "Your review" }) });
      await expect(review.getByText("Needs review")).toBeVisible();
      await expect(review.getByRole("button", { name: "Record review" })).toBeVisible();
    });
  }
});

test.describe("Evidence", () => {
  test("F19: one card per resource type in the city's profile, each saying how many sources it has", async ({
    page,
    sharedSampleProject,
  }) => {
    await page.goto(`/projects/${sharedSampleProject.id}/evidence`);

    const cards = page.locator("details").filter({ has: page.getByRole("heading", { level: 3 }) });
    expect(await cards.count()).toBeGreaterThan(0);
    for (const summary of await cards.locator("summary").allInnerTexts()) {
      expect(summary).toMatch(
        /(Approximate boundary: a site study sets the regulated boundary\.|Regulatory boundary\.) \d+ sources?/,
      );
    }
  });

  test("P1: an opened card shows each source's title, confidence, provenance, and a link to see it on the map", async ({
    page,
    sharedSampleProject,
  }) => {
    await page.goto(`/projects/${sharedSampleProject.id}/evidence`);
    const withSource = page
      .locator("details")
      .filter({ has: page.getByRole("heading", { level: 3 }) })
      .filter({ has: page.getByRole("link", { name: "Show on map" }) })
      .first();
    await withSource.locator("summary").first().click();

    await expect(withSource.getByText(/(High|Moderate|Low) confidence/).first()).toBeVisible();
    await expect(withSource.getByRole("link", { name: "Show on map" }).first()).toHaveAttribute(
      "href",
      /\/site\?layer=[0-9a-f-]{36}#map-workspace$/,
    );
    await expect(withSource.getByText("Sample data").first()).toBeVisible();
    await expect(withSource.locator("dt").first()).toBeVisible();
  });

  test("P1: Data quality names the dataset, when UPlan retrieved it, the publisher's date, and its known limitation", async ({
    page,
    sharedSampleProject,
  }) => {
    await page.goto(`/projects/${sharedSampleProject.id}/evidence`);
    const withSource = page
      .locator("details")
      .filter({ has: page.getByRole("link", { name: "Show on map" }) })
      .first();
    await withSource.locator("summary").first().click();
    await withSource.getByText("Data quality", { exact: true }).first().click();

    for (const label of [
      "Dataset",
      "Retrieved by UPlan",
      "Publisher's date",
      "Features",
      "Geometry repairs at ingestion",
      "Known limitation",
    ]) {
      await expect(withSource.locator("dt", { hasText: label }).first()).toBeVisible();
    }
    // "retrieved" is when UPlan fetched it, never presented as the publisher's date.
    await expect(withSource.locator("dt", { hasText: "Retrieved by UPlan" }).first()).not.toHaveText(
      "Publisher's date",
    );
  });

  test("R12: Show on map opens the Site page with that layer, and the map has a text list beside it", async ({
    page,
    sharedSampleProject,
  }) => {
    await page.goto(`/projects/${sharedSampleProject.id}/evidence`);
    const withSource = page
      .locator("details")
      .filter({ has: page.getByRole("link", { name: "Show on map" }) })
      .first();
    await withSource.locator("summary").first().click();
    await withSource.getByRole("link", { name: "Show on map" }).first().click();

    await expect(page).toHaveURL(
      new RegExp(`/projects/${sharedSampleProject.id}/site\\?layer=[0-9a-f-]{36}#map-workspace$`),
    );
    await expect(page.getByRole("heading", { name: "Map workspace" })).toBeVisible();
  });
});

test.describe("Screening, Studies, Impact", () => {
  test("P2: the Screening register says a screen flags reasons to look closer and never clears land", async ({
    page,
    sharedSampleProject,
  }) => {
    await page.goto(`/projects/${sharedSampleProject.id}/screening`);

    const register = page.locator("details", {
      has: page.getByRole("heading", { name: "Screening register" }),
    });
    await expect(register.locator("summary")).toContainText(
      /\d+ rows?\. Screening flags reasons to look closer\. It is not a finding, and it never clears land\./,
    );
    await register.locator("summary").click();
    await expect(register.locator("table")).toBeVisible();
    await expect(register.locator("th").first()).toBeVisible();
  });

  test("P2: Studies says the city decides which studies an application needs, and lists what the data can't say", async ({
    page,
    sharedSampleProject,
  }) => {
    await page.goto(`/projects/${sharedSampleProject.id}/studies`);

    const named = page.locator("details", {
      has: page.getByRole("heading", { name: "Studies named in the city's profile" }),
    });
    await expect(named.locator("summary")).toContainText(
      "The city decides which studies an application needs.",
    );
    await expect(page.getByRole("heading", { name: "Where the data can't say" })).toBeVisible();
    await expect(page.getByText(/no study needed/i)).toHaveCount(0);
  });

  test("P2: Impact shows the measured impact, both ends of any range, and never says whether it is acceptable", async ({
    page,
    sharedSampleProject,
  }) => {
    await page.goto(`/projects/${sharedSampleProject.id}/impact`);

    const measured = page.locator("details", { has: page.getByRole("heading", { name: "Measured impact" }) });
    await expect(measured.locator("summary")).toContainText(
      /\d+ measures?\. What the footprint would remove or disturb\./,
    );
    await expect(measured.locator("summary")).toContainText("it never says whether it is acceptable.");
    await expect(page.getByRole("heading", { name: "What desk analysis can't see" })).toBeVisible();
    await measured.locator("summary").click();
    await expect(measured.getByText(/Approximate boundary|Regulatory boundary/).first()).toBeVisible();
  });

  test("limits of desk analysis: significant trees are never counted from remote data", async ({
    page,
    sharedSampleProject,
  }) => {
    await page.goto(`/projects/${sharedSampleProject.id}/impact`);
    const limits = page.locator("details", {
      has: page.getByRole("heading", { name: "What desk analysis can't see" }),
    });
    await limits.locator("summary").click();

    await expect(limits).toContainText(/tree/i);
    await expect(limits.getByText(/\b\d+ (significant )?trees?\b/i)).toHaveCount(0);
  });
});

test.describe("the whole project", () => {
  for (const stage of STAGES) {
    test(`P2: ${stage.title} never says land is safe, clear, or approved, and never recommends`, async ({
      page,
      sharedSampleProject,
    }) => {
      await page.goto(`/projects/${sharedSampleProject.id}/${stage.step}`);
      // Open every closed section so text inside them counts too.
      for (const summary of await page.locator("details:not([open]) > summary").all()) await summary.click();

      const text = await page.locator("main").innerText();
      for (const phrase of VERDICT_PHRASES) expect(text, String(phrase)).not.toMatch(phrase);
    });

    test(`R12: ${stage.title}, with data and every section open, has no WCAG 2.1 A or AA violations`, async ({
      page,
      sharedSampleProject,
    }) => {
      await page.goto(`/projects/${sharedSampleProject.id}/${stage.step}`);
      for (const summary of await page.locator("details:not([open]) > summary").all()) await summary.click();

      await expectNoAxeViolations(page);
    });
  }

  test("F22: the Report step lists each of the six phases as still to review, each linking to its page", async ({
    page,
    sharedSampleProject,
  }) => {
    await page.goto(`/projects/${sharedSampleProject.id}/report`);

    for (const phase of PHASES) {
      const item = page.getByRole("listitem").filter({ hasText: `Review the ${PHASE_TITLE[phase]} phase.` });
      await expect(item.getByRole("link", { name: PHASE_TITLE[phase] })).toHaveAttribute(
        "href",
        `/projects/${sharedSampleProject.id}/${phase}`,
      );
    }
    await expect(page.getByText("The items above must be done first.")).toBeVisible();
  });

  test("F22 R11: finishing with phases unreviewed is refused", async ({ page, sharedSampleProject }) => {
    await page.goto(`/projects/${sharedSampleProject.id}/report`);
    await page.getByRole("button", { name: "Finish research and generate the document" }).click();

    await expect(page.getByRole("alert").filter({ hasText: /^Review .+ first\.$/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Generating the document" })).toHaveCount(0);
  });
});
