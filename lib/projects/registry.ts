import type { z } from "zod";
import { resultSchema as forestAlertsSchema } from "./forest-alerts";

// One entry per project. Adding a cause = a rubric in specs/projects/, an answer schema, and a row
// in the projects table.
export type ProjectDef = {
  id: string;
  name: string;
  specFile: string; // relative to specs/
  schema: z.ZodType<{ task_id: string; spec_version: string; label: string; answer: object; confidence: number; notes: string }>;
};

export const PROJECTS: Record<string, ProjectDef> = {
  "forest-alerts": {
    id: "forest-alerts",
    name: "Forest Alert Triage",
    specFile: "projects/forest-alerts.md",
    schema: forestAlertsSchema,
  },
};
