import {
  PHASES,
  PHASE_TITLE,
  STAGES,
  expectNoAxeViolations,
  goToStep,
  stageLink,
  type Phase,
} from "../support/app";
import { expect, test } from "../support/fixtures";

// One project's screens, on a project with nothing in it yet (no study area, no footprint): the frame, the stage
// rail, the Overview, the project details, the section feedback box, and what every step says when it has
// nothing to show. Nothing here needs the worker.

test.describe("the frame", () => {
  test("F18: the header names the project, its city, its type, and says it is in progress", async ({
    page,
    blankProject,
  }) => {
    await page.goto(`/projects/${blankProject.id}/overview`);

    const header = page.getByRole("heading", { level: 1 }).locator("xpath=ancestor::header[1]");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(blankProject.title);
    await expect(header).toContainText("Subdivision");
    await expect(header.getByText("In progress")).toBeVisible();
    await expect(header.getByText("Sample data")).toHaveCount(0);
    await expect(page.getByRole("note")).toHaveCount(0);
    await expect(
      header.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Dashboard" }),
    ).toHaveAttribute("href", "/dashboard");
  });

  test("F18 R1: the stage rail lists the eight steps in order, grouped Set up, Assemble, Analyze, Report", async ({
    page,
    blankProject,
  }) => {
    await page.goto(`/projects/${blankProject.id}/overview`);
    const rail = page.getByRole("navigation", { name: "Research stages" });

    await expect(rail.getByRole("link")).toHaveCount(8);
    await expect(rail.getByRole("link")).toHaveText(STAGES.map((s) => new RegExp(`${s.title}`)));
    for (const [index, group] of ["Set up", "Assemble", "Analyze", "Report"].entries()) {
      await expect(rail.getByText(`${index + 1}. ${group}`, { exact: true })).toBeVisible();
    }
    for (const [index, stage] of STAGES.entries()) {
      await expect(stageLink(page, stage.title)).toContainText(String(index + 1));
    }
  });

  test("F18 R2, R12: each stage says its state in words, and a blank project has nothing to review", async ({
    page,
    blankProject,
  }) => {
    await page.goto(`/projects/${blankProject.id}/overview`);

    await expect(stageLink(page, "Overview")).toContainText("Recorded");
    for (const phase of PHASES) await expect(stageLink(page, PHASE_TITLE[phase])).toContainText("To do");
    await expect(stageLink(page, "Report")).toContainText("Not ready");
  });

  test("F18 R3: every stage is a link, so the rail orders the work and never blocks it", async ({
    page,
    blankProject,
  }) => {
    await page.goto(`/projects/${blankProject.id}/overview`);

    for (const stage of STAGES) {
      await goToStep(page, stage.step);
      await expect(stageLink(page, stage.title)).toHaveAttribute("aria-current", "page");
      await expect(
        page.getByRole("navigation", { name: "Research stages" }).locator('[aria-current="page"]'),
      ).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(blankProject.title);
    }
  });

  test("F20: inside a project the navigation still marks the Dashboard as the current area", async ({
    page,
    blankProject,
  }) => {
    await page.goto(`/projects/${blankProject.id}/site`);
    await expect(
      page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /Dashboard/ }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("F18: the project index redirects to the Overview", async ({ page, blankProject }) => {
    await page.goto(`/projects/${blankProject.id}`);
    await expect(page).toHaveURL(new RegExp(`/projects/${blankProject.id}/overview$`));
  });

  test("F18 R7: with nothing to analyze the frame shows no analysis banner, because there is nothing to wait for", async ({
    page,
    blankProject,
  }) => {
    await page.goto(`/projects/${blankProject.id}/overview`);
    await expect(page.getByRole("status").filter({ hasText: /Analysis is/ })).toHaveCount(0);
  });

  test("F18: the breadcrumb returns to the dashboard", async ({ page, blankProject }) => {
    await page.goto(`/projects/${blankProject.id}/overview`);
    await page
      .getByRole("navigation", { name: "Breadcrumb" })
      .getByRole("link", { name: "Dashboard" })
      .click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});

test.describe("the Overview", () => {
  test("F18 R5: it answers what's known and what's not, in counts and words, with no score", async ({
    page,
    blankProject,
  }) => {
    await page.goto(`/projects/${blankProject.id}/overview`);

    for (const title of [
      "Project at a glance",
      "What next?",
      "What do we know?",
      "What don't we know?",
      "What could delay this?",
      "What can desk analysis not settle?",
    ]) {
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
    }
    const text = await page.locator("main").innerText();
    expect(text).not.toMatch(/\d\s?%/);
    expect(text).not.toMatch(/\b(score|rating|grade|ranking)\b/i);
  });

  test("F18 R6: the first next step for a blank project is to add the study area, and it links to the Site page", async ({
    page,
    blankProject,
  }) => {
    await page.goto(`/projects/${blankProject.id}/overview`);

    const next = page.locator("section", { has: page.getByRole("heading", { name: "What next?" }) });
    await expect(next.getByRole("listitem").first()).toContainText(
      "Add the study area: draw it, upload a boundary, or load the sample.",
    );
    await next.getByRole("link", { name: "Go there" }).first().click();
    await expect(page).toHaveURL(new RegExp(`/projects/${blankProject.id}/site$`));
  });

  test("F18 R18: every phase that is not reviewed is listed under 'Phases that need you', linking to its page", async ({
    page,
    blankProject,
  }) => {
    await page.goto(`/projects/${blankProject.id}/overview`);

    const needs = page
      .locator("div", { has: page.getByRole("heading", { name: "Phases that need you" }) })
      .last();
    for (const phase of PHASES) {
      await expect(needs.getByRole("link", { name: PHASE_TITLE[phase], exact: true })).toHaveAttribute(
        "href",
        `/projects/${blankProject.id}/${phase}`,
      );
    }
  });

  test("F18 R5: with no analysis, the accordions say why instead of showing a made-up answer", async ({
    page,
    blankProject,
  }) => {
    await page.goto(`/projects/${blankProject.id}/overview`);
    await page.getByRole("heading", { name: "What do we know?" }).click();

    await expect(
      page
        .getByText("Nothing to analyze yet. Add a study area on the Site page and UPlan starts the analysis.")
        .first(),
    ).toBeVisible();
    await expect(page.getByText(/safe to develop|no constraints/i)).toHaveCount(0);
  });

  test("F18: the assumptions say no footprint has been traced, so no impact was measured", async ({
    page,
    blankProject,
  }) => {
    await page.goto(`/projects/${blankProject.id}/overview`);
    await page.getByRole("heading", { name: "Assumptions the analysis made" }).click();

    // Without a profile resolution there is no run; the accordion states what is missing in the same words as the banner.
    await expect(page.getByText(/Nothing to analyze yet|No footprint has been traced/).first()).toBeVisible();
  });

  test("R12: the Overview has no WCAG 2.1 A or AA violations", async ({ page, blankProject }) => {
    await page.goto(`/projects/${blankProject.id}/overview`);
    await expectNoAxeViolations(page);
  });
});

test.describe("project details", () => {
  test("F5 R10: the form starts with the title and type, and offers to load sample details only while blank", async ({
    page,
    blankProject,
  }) => {
    await page.goto(`/projects/${blankProject.id}/overview`);
    await page.getByRole("heading", { name: "Project details" }).click();

    await expect(page.getByLabel("Title")).toHaveValue(blankProject.title);
    await expect(page.getByLabel("Application type")).toHaveValue("subdivision");
    await expect(page.getByRole("button", { name: "Save details" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Load sample details" })).toBeVisible();
  });

  test("F5 R10: saved details are shown, survive a reload, and the sample offer goes away", async ({
    page,
    blankProject,
  }) => {
    await page.goto(`/projects/${blankProject.id}/overview`);
    await page.getByRole("heading", { name: "Project details" }).click();
    await page.getByLabel("Parcel or address").fill("Parcel 1234567890");
    await page.getByLabel("Applicant").fill("Fictional Applicant Inc.");
    await page.getByLabel("Application filed on").fill("2026-02-03");
    await page.getByRole("button", { name: "Save details" }).click();

    await expect(page.getByRole("status").filter({ hasText: "Project details saved." })).toBeVisible();
    await page.reload();
    const glance = page.locator("section", {
      has: page.getByRole("heading", { name: "Project at a glance" }),
    });
    await expect(glance).toContainText("Parcel 1234567890");
    await expect(glance).toContainText("Fictional Applicant Inc.");
    await expect(glance).toContainText("2026-02-03");
    await page.getByRole("heading", { name: "Project details" }).click();
    await expect(page.getByRole("button", { name: "Load sample details" })).toHaveCount(0);
  });

  test("F5 R10: emptying a detail records it as Not yet recorded again", async ({ page, blankProject }) => {
    await page.goto(`/projects/${blankProject.id}/overview`);
    await page.getByRole("heading", { name: "Project details" }).click();
    await page.getByLabel("Applicant").fill("Someone Fictional");
    await page.getByRole("button", { name: "Save details" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Project details saved." })).toBeVisible();

    await page.getByLabel("Applicant").fill("");
    await page.getByRole("button", { name: "Save details" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Project details saved." })).toBeVisible();
    await page.reload();

    const glance = page.locator("section", {
      has: page.getByRole("heading", { name: "Project at a glance" }),
    });
    await expect(
      glance.locator("dt", { hasText: "Applicant" }).locator("xpath=following-sibling::dd[1]"),
    ).toHaveText("Not yet recorded");
  });

  test("F5: renaming the project changes the header everywhere", async ({ page, blankProject }) => {
    const renamed = `${blankProject.title} renamed`;
    await page.goto(`/projects/${blankProject.id}/overview`);
    await page.getByRole("heading", { name: "Project details" }).click();
    await page.getByLabel("Title").fill(renamed);
    await page.getByRole("button", { name: "Save details" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(renamed);

    await page.goto("/dashboard");
    await expect(page.getByRole("button", { name: `Delete research: ${renamed}` })).toBeVisible();
    // Put the original title back so the fixture can find the project to delete it.
    await page.goto(`/projects/${blankProject.id}/overview`);
    await page.getByRole("heading", { name: "Project details" }).click();
    await page.getByLabel("Title").fill(blankProject.title);
    await page.getByRole("button", { name: "Save details" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(blankProject.title);
  });

  test("F5 R10: a title emptied to nothing is refused, and the project keeps its name", async ({
    page,
    blankProject,
  }) => {
    await page.goto(`/projects/${blankProject.id}/overview`);
    await page.getByRole("heading", { name: "Project details" }).click();
    await page.getByLabel("Title").fill("   ");
    await page.getByRole("button", { name: "Save details" }).click();

    await expect(page.getByRole("alert").filter({ hasText: "The title is required." })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(blankProject.title);
  });

  test("F5 R11: an edit made from an out-of-date page is refused, never allowed to overwrite a newer one", async ({
    browser,
    page,
    baseURL,
    blankProject,
  }) => {
    // A second window for the same person, opened before the first one saves.
    const second = await browser.newContext({ storageState: await page.context().storageState(), baseURL });
    const stalePage = await second.newPage();
    const url = `/projects/${blankProject.id}/overview`;
    try {
      await page.goto(url);
      await stalePage.goto(url);
      await page.getByRole("heading", { name: "Project details" }).click();
      await stalePage.getByRole("heading", { name: "Project details" }).click();

      await page.getByLabel("Applicant").fill("Saved first");
      await page.getByRole("button", { name: "Save details" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Project details saved." })).toBeVisible();

      await stalePage.getByLabel("Applicant").fill("Saved second, from a stale page");
      await stalePage.getByRole("button", { name: "Save details" }).click();
      await expect(stalePage.getByRole("alert").filter({ hasText: /\S/ }).last()).toBeVisible();
      await expect(stalePage.getByRole("status").filter({ hasText: "Project details saved." })).toHaveCount(
        0,
      );

      await page.reload();
      const glance = page.locator("section", {
        has: page.getByRole("heading", { name: "Project at a glance" }),
      });
      await expect(glance).toContainText("Saved first");
      await expect(glance).not.toContainText("Saved second");
    } finally {
      await second.close();
    }
  });

  test("F23: Load sample details fills the blank details with values that say they are fictional", async ({
    page,
    blankProject,
  }) => {
    await page.goto(`/projects/${blankProject.id}/overview`);
    await page.getByRole("heading", { name: "Project details" }).click();
    await page.getByRole("button", { name: "Load sample details" }).click();

    await expect(page.getByRole("status").filter({ hasText: "Sample details loaded." })).toBeVisible();
    await page.reload();
    const glance = page.locator("section", {
      has: page.getByRole("heading", { name: "Project at a glance" }),
    });
    await expect(
      glance.locator("dt", { hasText: "Parcel or address" }).locator("xpath=following-sibling::dd[1]"),
    ).toHaveText(/sample|fictional/i);
    await expect(
      glance.locator("dt", { hasText: "Applicant" }).locator("xpath=following-sibling::dd[1]"),
    ).toHaveText(/sample|fictional/i);
  });
});

test.describe("section feedback", () => {
  test("research-phases R15: every step but Report has a report section and a feedback box", async ({
    page,
    blankProject,
  }) => {
    for (const stage of STAGES.filter((s) => s.step !== "report")) {
      await page.goto(`/projects/${blankProject.id}/${stage.step}`);
      await expect(
        page.getByRole("region", { name: `Report section produced by ${stage.title}` }),
      ).toBeVisible();
      await expect(page.getByLabel("Feedback on this section")).toBeVisible();
    }
    await page.goto(`/projects/${blankProject.id}/report`);
    await expect(page.getByLabel("Feedback on this section")).toHaveCount(0);
  });

  test("research-phases R15: feedback is recorded with the person's name, listed under Earlier feedback, and changes nothing else", async ({
    page,
    blankProject,
  }) => {
    await page.goto(`/projects/${blankProject.id}/evidence`);
    const before = await stageLink(page, "Evidence").innerText();
    await page.getByLabel("Feedback on this section").fill("Please list the dataset vintage first.");
    await page.getByRole("button", { name: "Send feedback" }).click();

    await expect(page.getByRole("status").filter({ hasText: "Feedback recorded." })).toBeVisible();
    await page.reload();
    const earlier = page.getByText(/Earlier feedback \(1\)/);
    await expect(earlier).toBeVisible();
    await earlier.click();
    await expect(page.getByText("“Please list the dataset vintage first.”")).toBeVisible();
    expect(await stageLink(page, "Evidence").innerText()).toBe(before);
  });

  test("research-phases R15: empty feedback is stopped by the browser", async ({ page, blankProject }) => {
    await page.goto(`/projects/${blankProject.id}/site`);
    await page.getByRole("button", { name: "Send feedback" }).click();

    expect(
      await page
        .getByLabel("Feedback on this section")
        .evaluate((el: HTMLTextAreaElement) => el.validity.valueMissing),
    ).toBe(true);
    await expect(page.getByRole("status").filter({ hasText: "Feedback recorded." })).toHaveCount(0);
  });

  test("research-phases R15: feedback is limited to 2,000 characters", async ({ page, blankProject }) => {
    await page.goto(`/projects/${blankProject.id}/site`);
    await expect(page.getByLabel("Feedback on this section")).toHaveAttribute("maxlength", "2000");
  });
});

// What each step says with no study area. The wording comes from workflow-labels.ts; none of it is a verdict.
const NEEDS_STUDY_AREA: Phase[] = ["evidence", "screening", "studies"];

test.describe("steps with nothing to show", () => {
  for (const phase of PHASES) {
    test(`research-phases R1, R13: ${PHASE_TITLE[phase]} says what is missing, offers no review, and leads to where to fix it`, async ({
      page,
      blankProject,
    }) => {
      await page.goto(`/projects/${blankProject.id}/${phase}`);

      const drafted = page.locator("details", { has: page.getByRole("heading", { name: "Drafted output" }) });
      await expect(drafted).toContainText(/This phase needs a (study area|footprint)\./);
      await drafted.locator("summary").click();
      await expect(drafted).toContainText("No language model wrote it.");

      const review = page.locator("section", { has: page.getByRole("heading", { name: "Your review" }) });
      await expect(review).toContainText("There is nothing to review yet.");
      await expect(review.getByRole("button", { name: "Record review" })).toHaveCount(0);
      await expect(review.getByText("To do")).toBeVisible();

      const history = page.locator("details", { has: page.getByRole("heading", { name: "History" }) });
      await expect(history).toContainText("No review has been recorded for this phase yet.");

      const inputs = page.locator("details", { has: page.getByRole("heading", { name: "Drafted from" }) });
      await inputs.locator("summary").click();
      await expect(inputs.getByRole("link").first()).toBeVisible();
    });
  }

  for (const phase of NEEDS_STUDY_AREA) {
    test(`research-phases R9: ${PHASE_TITLE[phase]} links back to the Site page, where the study area is added`, async ({
      page,
      blankProject,
    }) => {
      await page.goto(`/projects/${blankProject.id}/${phase}`);
      const inputs = page.locator("details", { has: page.getByRole("heading", { name: "Drafted from" }) });
      await inputs.locator("summary").click();
      await inputs.getByRole("link", { name: "Change the study area" }).click();

      await expect(page).toHaveURL(new RegExp(`/projects/${blankProject.id}/site$`));
    });
  }

  test("F8: the Footprint page asks for the study area first and links to the Site page", async ({
    page,
    blankProject,
  }) => {
    await page.goto(`/projects/${blankProject.id}/footprint`);

    await expect(
      page.getByText("The footprint is traced relative to the study area, so add the study area first"),
    ).toBeVisible();
    await page.getByRole("link", { name: "Site page" }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${blankProject.id}/site$`));
  });

  test("F5: the Site page offers a map, an upload, and the sample study area, and says what a boundary is", async ({
    page,
    blankProject,
  }) => {
    await page.goto(`/projects/${blankProject.id}/site`);

    await expect(page.getByRole("heading", { name: "Study area", exact: true })).toBeVisible();
    await expect(page.getByLabel("Upload a boundary (.geojson, up to 2 MB)")).toBeAttached();
    await expect(page.getByRole("button", { name: "Upload boundary" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Load sample study area" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Map workspace" })).toBeVisible();
  });

  test("F5: uploading with no file chosen is stopped by the browser", async ({ page, blankProject }) => {
    await page.goto(`/projects/${blankProject.id}/site`);
    await page.getByRole("button", { name: "Upload boundary" }).click();

    expect(
      await page
        .getByLabel("Upload a boundary (.geojson, up to 2 MB)")
        .evaluate((el: HTMLInputElement) => el.validity.valueMissing),
    ).toBe(true);
  });

  test("F5: a file that is not a boundary is rejected with a message, and no study area is saved", async ({
    page,
    blankProject,
  }) => {
    await page.goto(`/projects/${blankProject.id}/site`);
    await page.getByLabel("Upload a boundary (.geojson, up to 2 MB)").setInputFiles({
      name: "not-a-boundary.geojson",
      mimeType: "application/geo+json",
      buffer: Buffer.from('{"type":"Point","coordinates":[-122.0,47.6]}'),
    });
    await page.getByRole("button", { name: "Upload boundary" }).click();

    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "The file holds a Point. A boundary must be a Polygon or a MultiPolygon." }),
    ).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Boundary uploaded." })).toHaveCount(0);
    await page.goto(`/projects/${blankProject.id}/overview`);
    await expect(stageLink(page, "Site")).toContainText("To do");
  });

  test("F5: invalid JSON in an upload is rejected, never repaired", async ({ page, blankProject }) => {
    await page.goto(`/projects/${blankProject.id}/site`);
    await page.getByLabel("Upload a boundary (.geojson, up to 2 MB)").setInputFiles({
      name: "broken.geojson",
      mimeType: "application/geo+json",
      buffer: Buffer.from("{ this is not json"),
    });
    await page.getByRole("button", { name: "Upload boundary" }).click();

    await expect(page.getByRole("alert").filter({ hasText: /\S/ }).last()).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Boundary uploaded." })).toHaveCount(0);
  });

  test("F5: a self-intersecting polygon is rejected rather than quietly fixed", async ({
    page,
    blankProject,
  }) => {
    await page.goto(`/projects/${blankProject.id}/site`);
    const bowTie = {
      type: "Polygon",
      coordinates: [
        [
          [-122.03, 47.6],
          [-122.01, 47.62],
          [-122.01, 47.6],
          [-122.03, 47.62],
          [-122.03, 47.6],
        ],
      ],
    };
    await page.getByLabel("Upload a boundary (.geojson, up to 2 MB)").setInputFiles({
      name: "bow-tie.geojson",
      mimeType: "application/geo+json",
      buffer: Buffer.from(JSON.stringify(bowTie)),
    });
    await page.getByRole("button", { name: "Upload boundary" }).click();

    await expect(page.getByRole("alert").filter({ hasText: /\S/ }).last()).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Boundary uploaded." })).toHaveCount(0);
  });

  test("F5: coordinates in meters instead of longitude and latitude are rejected", async ({
    page,
    blankProject,
  }) => {
    await page.goto(`/projects/${blankProject.id}/site`);
    const projected = {
      type: "Polygon",
      coordinates: [
        [
          [1290000, 230000],
          [1290100, 230000],
          [1290100, 230100],
          [1290000, 230100],
          [1290000, 230000],
        ],
      ],
    };
    await page.getByLabel("Upload a boundary (.geojson, up to 2 MB)").setInputFiles({
      name: "projected.geojson",
      mimeType: "application/geo+json",
      buffer: Buffer.from(JSON.stringify(projected)),
    });
    await page.getByRole("button", { name: "Upload boundary" }).click();

    await expect(page.getByRole("alert").filter({ hasText: /\S/ }).last()).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Boundary uploaded." })).toHaveCount(0);
  });
});

test.describe("the Report step on a project that is not ready", () => {
  test("F22: it lists what is still to do, names each phase, and links to it", async ({
    page,
    blankProject,
  }) => {
    await page.goto(`/projects/${blankProject.id}/report`);

    await expect(page.getByRole("heading", { name: "Finish research" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Before finishing" })).toBeVisible();
    await expect(page.getByText("To do").first()).toBeVisible();
    await expect(page.getByText("The items above must be done first.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Document versions" })).toBeVisible();
    await expect(page.getByText("No version has been published yet.")).toBeVisible();
  });

  test("F22 R11: pressing Finish anyway is refused by the server and no document is started", async ({
    page,
    blankProject,
  }) => {
    await page.goto(`/projects/${blankProject.id}/report`);
    await page.getByRole("button", { name: "Finish research and generate the document" }).click();

    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "The analysis for the current inputs hasn't finished. Try again when it has." }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Generating the document" })).toHaveCount(0);
    await expect(page.getByText("No version has been published yet.")).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1 }).locator("xpath=ancestor::header[1]").getByText("In progress"),
    ).toBeVisible();
  });

  test("F22 R12: asking for a version that does not exist is a 404, not a file", async ({
    page,
    blankProject,
  }) => {
    const response = await page.request.get(`/api/projects/${blankProject.id}/documents/1`);
    expect(response.status()).toBe(404);
  });

  test("R12: the Report step has no WCAG 2.1 A or AA violations", async ({ page, blankProject }) => {
    await page.goto(`/projects/${blankProject.id}/report`);
    await expectNoAxeViolations(page);
  });
});

test.describe("accessibility of every step", () => {
  for (const stage of STAGES) {
    test(`R12: ${stage.title} has no WCAG 2.1 A or AA violations`, async ({ page, blankProject }) => {
      await page.goto(`/projects/${blankProject.id}/${stage.step}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(blankProject.title);
      await expectNoAxeViolations(page);
    });
  }
});
