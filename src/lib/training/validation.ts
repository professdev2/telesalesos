import { z } from "zod";

export type TrainingVisibility = "platform" | "organization";

function extractVimeoVideoId(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "vimeo.com") {
    const id = parts.find((part) => /^\d+$/.test(part));
    return id ?? null;
  }

  if (
    (host === "player.vimeo.com" || host === "vimeo.com") &&
    parts[0] === "video" &&
    /^\d+$/.test(parts[1] ?? "")
  ) {
    return parts[1];
  }

  return null;
}

const vimeoUrlSchema = z
  .string()
  .trim()
  .max(2048, "Vimeo URL must be 2048 characters or fewer.")
  .transform((value, ctx) => {
    const id = extractVimeoVideoId(value);
    if (!id) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid Vimeo video URL.",
      });
      return z.NEVER;
    }
    return id;
  });

const httpsUrlSchema = z
  .string()
  .trim()
  .max(2048, "Resource URL must be 2048 characters or fewer.")
  .refine((value) => {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }, "Enter a valid HTTPS resource URL.");

const descriptionSchema = z
  .string()
  .trim()
  .max(2000, "Description must be 2000 characters or fewer.")
  .optional()
  .transform((value) => (value === "" ? undefined : value));

const sectionSchema = z
  .string()
  .trim()
  .max(80, "Section must be 80 characters or fewer.")
  .optional()
  .transform((value) => (value === "" ? undefined : value));

const thumbnailUrlSchema = z
  .string()
  .trim()
  .max(2048, "Thumbnail URL must be 2048 characters or fewer.")
  .optional()
  .transform((value) => (value === "" ? undefined : value))
  .superRefine((value, ctx) => {
    if (value === undefined) return;
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      ctx.addIssue({ code: "custom", message: "Enter a valid HTTPS image URL." });
      return;
    }
    if (url.protocol !== "https:") {
      ctx.addIssue({ code: "custom", message: "Enter a valid HTTPS image URL." });
      return;
    }
    const host = url.hostname.toLowerCase();
    // Pexels photo pages are HTML, not images — reject those and require the CDN.
    if (host === "www.pexels.com" || host === "pexels.com") {
      ctx.addIssue({
        code: "custom",
        message:
          "That is a Pexels page link. Use Search images and click a photo, or paste an images.pexels.com URL.",
      });
      return;
    }
    if (host.includes("drive.google.com") || host.includes("share.google.com")) {
      ctx.addIssue({
        code: "custom",
        message:
          "Google Drive / share links do not display as thumbnails. Use Search images instead.",
      });
    }
  });

const sortOrderSchema = z.coerce
  .number()
  .int("Sort order must be a whole number.")
  .min(0, "Sort order cannot be negative.")
  .max(100000, "Sort order is too large.")
  .default(0);

export const trainingCourseSchema = z.object({
  visibility: z.enum(["platform", "organization"]),
  name: z
    .string()
    .trim()
    .min(2, "Enter a course name.")
    .max(120, "Course name must be 120 characters or fewer."),
  description: descriptionSchema,
  section: sectionSchema,
  thumbnailUrl: thumbnailUrlSchema,
});

export const trainingCourseUpdateSchema = trainingCourseSchema.omit({
  visibility: true,
}).extend({
  id: z.uuid("This course reference is invalid. Reload the page."),
});

export const trainingCourseArchiveSchema = z.object({
  id: z.uuid("This course reference is invalid. Reload the page."),
});

export const trainingLessonSchema = z.object({
  courseId: z.uuid("This course reference is invalid. Reload the page."),
  title: z
    .string()
    .trim()
    .min(2, "Enter a lesson title.")
    .max(120, "Lesson title must be 120 characters or fewer."),
  vimeoVideoId: vimeoUrlSchema,
  sortOrder: sortOrderSchema,
});

export const trainingLessonUpdateSchema = trainingLessonSchema
  .omit({ courseId: true })
  .extend({
    id: z.uuid("This lesson reference is invalid. Reload the page."),
  });

export const trainingLessonArchiveSchema = z.object({
  id: z.uuid("This lesson reference is invalid. Reload the page."),
});

export const trainingResourceSchema = z.object({
  lessonId: z.uuid("This lesson reference is invalid. Reload the page."),
  title: z
    .string()
    .trim()
    .min(1, "Enter a resource title.")
    .max(120, "Resource title must be 120 characters or fewer."),
  url: httpsUrlSchema,
  sortOrder: sortOrderSchema,
});

export const trainingFileMetaSchema = z.object({
  lessonId: z.uuid("This lesson reference is invalid. Reload the page."),
  title: z
    .string()
    .trim()
    .min(1, "Enter a download title.")
    .max(120, "Title must be 120 characters or fewer."),
  sortOrder: sortOrderSchema,
});

export const MAX_TRAINING_UPLOAD_BYTES = 50 * 1024 * 1024;

export const ALLOWED_TRAINING_UPLOAD_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export function vimeoPlayerUrl(videoId: string): string {
  if (!/^\d+$/.test(videoId)) {
    throw new Error("Invalid Vimeo video id.");
  }
  return `https://player.vimeo.com/video/${videoId}?byline=0&portrait=0&title=0`;
}
