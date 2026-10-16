import { test as base } from "@playwright/test";

import {
  createProject,
  createSampleProject,
  deleteProject,
  uniqueTitle,
  waitForAnalysisToSettle,
} from "./app";
import { AUTH_FILE, BASE_URL } from "./env";

export { expect } from "@playwright/test";

export type ProjectRef = { id: string; title: string };

// Projects the specs make for themselves, and take down again. "Take down" is the planner's Delete: the project
// leaves their lists and UPlan keeps its records (project-dashboard.md R5), so every title starts with "E2E" for
// staff to recognise.
type Fixtures = {
  /** A project with only a title: no study area, no footprint, nothing analysed. Made and deleted per test. */
  blankProject: ProjectRef;
  /** A sample-data project, analysed, made and deleted per test. Needs the worker. */
  ownSampleProject: ProjectRef;
};

type WorkerFixtures = {
  /** One project with only a title, shared by every test in a worker. Read-only: no test may change it. */
  sharedBlankProject: ProjectRef;
  /** One analysed sample-data project shared by every test in a worker. Read-only: no test may change it. */
  sharedSampleProject: ProjectRef;
};

export const test = base.extend<Fixtures, WorkerFixtures>({
  blankProject: async ({ page }, use) => {
    const title = uniqueTitle("blank");
    const id = await createProject(page, { title });
    await use({ id, title });
    await deleteProject(page, title);
  },

  ownSampleProject: async ({ page }, use) => {
    const project = await createSampleProject(page);
    await waitForAnalysisToSettle(page);
    await use(project);
    await deleteProject(page, project.title);
  },

  sharedBlankProject: [
    async ({ browser }, use) => {
      const context = await browser.newContext({ baseURL: BASE_URL, storageState: AUTH_FILE });
      const page = await context.newPage();
      const title = uniqueTitle("shared-blank");
      const id = await createProject(page, { title });
      await use({ id, title });
      await deleteProject(page, title);
      await context.close();
    },
    { scope: "worker" },
  ],

  sharedSampleProject: [
    async ({ browser }, use) => {
      const context = await browser.newContext({ baseURL: BASE_URL, storageState: AUTH_FILE });
      const page = await context.newPage();
      const project = await createSampleProject(page);
      await waitForAnalysisToSettle(page);
      await use(project);
      await deleteProject(page, project.title);
      await context.close();
    },
    { scope: "worker", timeout: 5 * 60_000 },
  ],
});
