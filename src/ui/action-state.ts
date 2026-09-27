// What a Server Function returns to a form (project-dashboard.md, "Server Function pattern"): an error
// the person can act on, or a notice that it worked. Neither, and the form simply re-rendered. Lives
// outside the "use client" files so a "use server" file can import the type.
export type ActionState = { error?: string; notice?: string };
