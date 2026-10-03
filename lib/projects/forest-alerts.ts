import { z } from "zod";

// Answer schema for specs/projects/forest-alerts.md §3. Keep the two in sync.
export const LABELS = ["clearing_confirmed", "no_clearing", "uncertain"] as const;
export const DRIVERS = [
  "pasture_or_crops",
  "mining",
  "road",
  "selective_logging",
  "fire",
  "plantation_harvest",
  "natural",
  "urban_or_infrastructure",
  "unknown",
] as const;

export const resultSchema = z
  .object({
    task_id: z.string({ error: "task_id is required (copy it from the task)" }).min(1),
    spec_version: z.string({ error: "spec_version is required (copy it from the task)" }).min(1),
    label: z.enum(LABELS, { error: `label must be exactly one of: ${LABELS.join(", ")}` }),
    answer: z.object(
      {
        driver: z.enum(DRIVERS, { error: `answer.driver must be exactly one of: ${DRIVERS.join(", ")}` }),
        extends_existing_clearing: z.boolean({ error: "answer.extends_existing_clearing must be true or false" }),
        cloud_obstructed: z.boolean({ error: "answer.cloud_obstructed must be true or false" }),
      },
      { error: "answer must be an object with driver, extends_existing_clearing and cloud_obstructed" },
    ),
    confidence: z
      .number({ error: "confidence must be a number from 0 to 1, not a word" })
      .min(0, "confidence must be >= 0")
      .max(1, "confidence must be <= 1"),
    notes: z
      .string({ error: "notes is required: describe what you saw in at least 20 characters" })
      .trim()
      .min(20, "notes must be at least 20 characters describing what you saw")
      .max(2000, "notes must be at most 2000 characters"),
  })
  .refine((r) => r.label === "clearing_confirmed" || r.answer.driver === "unknown", {
    message: "answer.driver must be 'unknown' unless label is clearing_confirmed",
    path: ["answer", "driver"],
  });

export type ForestAlertResult = z.infer<typeof resultSchema>;

export function formatIssues(err: z.ZodError): string {
  return err.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; ");
}
