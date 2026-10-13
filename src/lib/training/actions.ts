"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireCurrentUser } from "@/lib/auth/dal";
import { toFieldErrors, type AuthFormState } from "@/lib/auth/validation";
import { requireActiveMembership } from "@/lib/org/active-org";
import { createClient } from "@/lib/supabase/server";
import {
  canManageAgencyTraining,
  canManageTrainingLibrary,
  isPlatformAdmin,
} from "@/lib/training/access";
import {
  isPexelsConfigured,
  searchPexelsPhotos,
} from "@/lib/training/pexels";
import type { PexelsPhoto } from "@/lib/training/pexels-types";
import {
  trainingCourseArchiveSchema,
  trainingCourseSchema,
  trainingCourseUpdateSchema,
  trainingFileMetaSchema,
  trainingLessonArchiveSchema,
  trainingLessonSchema,
  trainingLessonUpdateSchema,
  trainingResourceSchema,
  ALLOWED_TRAINING_UPLOAD_TYPES,
  MAX_TRAINING_UPLOAD_BYTES,
  type TrainingVisibility,
} from "@/lib/training/validation";

function invalid(fieldErrors: Record<string, string[]>): AuthFormState {
  return {
    status: "error",
    message: "Please correct the highlighted fields.",
    fieldErrors,
  };
}

function failure(message: string): AuthFormState {
  return { status: "error", message };
}

function textField(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
}

/** Owners/admins search Pexels for course catalog thumbnails. */
export async function searchPexelsThumbnailsAction(
  query: string,
): Promise<{ photos: PexelsPhoto[]; configured: boolean; error?: string }> {
  const membership = await requireActiveMembership();
  const platformAdmin = await isPlatformAdmin();
  if (!canManageAgencyTraining(membership) && !platformAdmin) {
    return { photos: [], configured: false, error: "Not allowed." };
  }

  const configured = isPexelsConfigured();
  if (!configured) {
    return {
      photos: [],
      configured: false,
      error: "Pexels is not configured on this environment.",
    };
  }

  const photos = await searchPexelsPhotos(query);
  return { photos, configured: true };
}

function mapWriteError(message: string): string {
  if (/platform admin/i.test(message)) {
    return "Only a TelesalesOS platform administrator can change platform training.";
  }
  if (/owners and admins|cannot write|permission denied/i.test(message)) {
    return "Only organization owners and admins can change agency training.";
  }
  if (/does not exist/i.test(message)) {
    return "That training item is no longer available.";
  }
  return message;
}

async function loadCourseOwnership(courseId: string): Promise<{
  visibility: TrainingVisibility;
  organizationId: string | null;
  archivedAt: string | null;
} | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("training_courses")
    .select("visibility, organization_id, archived_at")
    .eq("id", courseId)
    .maybeSingle();

  if (!data) return null;
  return {
    visibility: data.visibility as TrainingVisibility,
    organizationId: data.organization_id,
    archivedAt: data.archived_at,
  };
}

export async function createTrainingCourseAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = trainingCourseSchema.safeParse({
    visibility: textField(formData, "visibility"),
    name: textField(formData, "name"),
    description: textField(formData, "description"),
    section: textField(formData, "section"),
    thumbnailUrl: textField(formData, "thumbnailUrl"),
  });
  if (!parsed.success) return invalid(toFieldErrors(parsed.error));

  const [user, membership] = await Promise.all([
    requireCurrentUser(),
    requireActiveMembership(),
  ]);

  if (
    parsed.data.visibility === "platform"
      ? !(await isPlatformAdmin())
      : !canManageAgencyTraining(membership)
  ) {
    return failure(
      parsed.data.visibility === "platform"
        ? "Only a TelesalesOS platform administrator can add platform training."
        : "Only organization owners and admins can add agency training.",
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.from("training_courses").insert({
    visibility: parsed.data.visibility,
    organization_id:
      parsed.data.visibility === "organization"
        ? membership.organizationId
        : null,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    section: parsed.data.section ?? null,
    thumbnail_url: parsed.data.thumbnailUrl ?? null,
    created_by: user.id,
  });

  if (error) return failure(mapWriteError(error.message));
  revalidatePath("/training");
  return { status: "success", message: "Course added." };
}

export async function updateTrainingCourseAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = trainingCourseUpdateSchema.safeParse({
    id: textField(formData, "courseId"),
    name: textField(formData, "name"),
    description: textField(formData, "description"),
    section: textField(formData, "section"),
    thumbnailUrl: textField(formData, "thumbnailUrl"),
  });
  if (!parsed.success) return invalid(toFieldErrors(parsed.error));

  const membership = await requireActiveMembership();
  const ownership = await loadCourseOwnership(parsed.data.id);
  if (
    !ownership ||
    !(await canManageTrainingLibrary(
      ownership.visibility,
      ownership.organizationId,
      membership,
    ))
  ) {
    return failure("You cannot change this course.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("training_courses")
    .update({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      section: parsed.data.section ?? null,
      thumbnail_url: parsed.data.thumbnailUrl ?? null,
    })
    .eq("id", parsed.data.id)
    .is("archived_at", null)
    .select("id");

  if (error) return failure(mapWriteError(error.message));
  if (!data?.length) return failure("This course is archived or no longer exists.");

  revalidatePath("/training");
  revalidatePath(`/training/courses/${parsed.data.id}`);
  return { status: "success", message: "Course updated." };
}

export async function archiveTrainingCourseAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = trainingCourseArchiveSchema.safeParse({
    id: textField(formData, "courseId"),
  });
  if (!parsed.success) return invalid(toFieldErrors(parsed.error));

  const membership = await requireActiveMembership();
  const ownership = await loadCourseOwnership(parsed.data.id);
  if (
    !ownership ||
    !(await canManageTrainingLibrary(
      ownership.visibility,
      ownership.organizationId,
      membership,
    ))
  ) {
    return failure("You cannot archive this course.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("training_courses")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .is("archived_at", null)
    .select("id");

  if (error) return failure(mapWriteError(error.message));
  if (!data?.length) return failure("This course is already archived.");

  revalidatePath("/training");
  revalidatePath(`/training/courses/${parsed.data.id}`);
  redirect("/training");
}

export async function createTrainingLessonAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = trainingLessonSchema.safeParse({
    courseId: textField(formData, "courseId"),
    title: textField(formData, "title"),
    vimeoVideoId: textField(formData, "vimeoUrl"),
    sortOrder: textField(formData, "sortOrder") ?? "0",
  });
  if (!parsed.success) return invalid(toFieldErrors(parsed.error));

  const [user, membership] = await Promise.all([
    requireCurrentUser(),
    requireActiveMembership(),
  ]);
  const ownership = await loadCourseOwnership(parsed.data.courseId);
  if (
    !ownership ||
    ownership.archivedAt ||
    !(await canManageTrainingLibrary(
      ownership.visibility,
      ownership.organizationId,
      membership,
    ))
  ) {
    return failure("You cannot add lessons to this course.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("training_lessons").insert({
    course_id: parsed.data.courseId,
    title: parsed.data.title,
    vimeo_video_id: parsed.data.vimeoVideoId,
    sort_order: parsed.data.sortOrder,
    created_by: user.id,
  });

  if (error) return failure(mapWriteError(error.message));
  revalidatePath(`/training/courses/${parsed.data.courseId}`);
  return { status: "success", message: "Lesson added." };
}

export async function updateTrainingLessonAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = trainingLessonUpdateSchema.safeParse({
    id: textField(formData, "lessonId"),
    title: textField(formData, "title"),
    vimeoVideoId: textField(formData, "vimeoUrl"),
    sortOrder: textField(formData, "sortOrder") ?? "0",
  });
  if (!parsed.success) return invalid(toFieldErrors(parsed.error));

  const membership = await requireActiveMembership();
  const supabase = await createClient();
  const { data: lesson } = await supabase
    .from("training_lessons")
    .select("course_id")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!lesson) return failure("This lesson no longer exists.");

  const ownership = await loadCourseOwnership(lesson.course_id);
  if (
    !ownership ||
    ownership.archivedAt ||
    !(await canManageTrainingLibrary(
      ownership.visibility,
      ownership.organizationId,
      membership,
    ))
  ) {
    return failure("You cannot change this lesson.");
  }

  const { data, error } = await supabase
    .from("training_lessons")
    .update({
      title: parsed.data.title,
      vimeo_video_id: parsed.data.vimeoVideoId,
      sort_order: parsed.data.sortOrder,
    })
    .eq("id", parsed.data.id)
    .is("archived_at", null)
    .select("id");

  if (error) return failure(mapWriteError(error.message));
  if (!data?.length) return failure("This lesson is archived or no longer exists.");

  revalidatePath(`/training/courses/${lesson.course_id}`);
  revalidatePath(`/training/lessons/${parsed.data.id}`);
  return { status: "success", message: "Lesson updated." };
}

export async function archiveTrainingLessonAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = trainingLessonArchiveSchema.safeParse({
    id: textField(formData, "lessonId"),
  });
  if (!parsed.success) return invalid(toFieldErrors(parsed.error));

  const membership = await requireActiveMembership();
  const supabase = await createClient();
  const { data: lesson } = await supabase
    .from("training_lessons")
    .select("course_id")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!lesson) return failure("This lesson no longer exists.");

  const ownership = await loadCourseOwnership(lesson.course_id);
  if (
    !ownership ||
    !(await canManageTrainingLibrary(
      ownership.visibility,
      ownership.organizationId,
      membership,
    ))
  ) {
    return failure("You cannot archive this lesson.");
  }

  const { data, error } = await supabase
    .from("training_lessons")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .is("archived_at", null)
    .select("id");

  if (error) return failure(mapWriteError(error.message));
  if (!data?.length) return failure("This lesson is already archived.");

  revalidatePath(`/training/courses/${lesson.course_id}`);
  revalidatePath(`/training/lessons/${parsed.data.id}`);
  redirect(`/training/courses/${lesson.course_id}`);
}

export async function createTrainingResourceAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = trainingResourceSchema.safeParse({
    lessonId: textField(formData, "lessonId"),
    title: textField(formData, "title"),
    url: textField(formData, "url"),
    sortOrder: textField(formData, "sortOrder") ?? "0",
  });
  if (!parsed.success) return invalid(toFieldErrors(parsed.error));

  const [user, membership] = await Promise.all([
    requireCurrentUser(),
    requireActiveMembership(),
  ]);
  const supabase = await createClient();
  const { data: lesson } = await supabase
    .from("training_lessons")
    .select("course_id, archived_at")
    .eq("id", parsed.data.lessonId)
    .maybeSingle();
  if (!lesson || lesson.archived_at) return failure("This lesson is not editable.");

  const ownership = await loadCourseOwnership(lesson.course_id);
  if (
    !ownership ||
    ownership.archivedAt ||
    !(await canManageTrainingLibrary(
      ownership.visibility,
      ownership.organizationId,
      membership,
    ))
  ) {
    return failure("You cannot add resources to this lesson.");
  }

  const { error } = await supabase.from("training_resources").insert({
    lesson_id: parsed.data.lessonId,
    title: parsed.data.title,
    source: "link",
    url: parsed.data.url,
    storage_path: null,
    sort_order: parsed.data.sortOrder,
    created_by: user.id,
  });

  if (error) return failure(mapWriteError(error.message));
  revalidatePath(`/training/lessons/${parsed.data.lessonId}`);
  return {
    status: "success",
    message:
      "Resource link added. Access is controlled by the external provider.",
  };
}

function sanitizeUploadFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "file";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
  return cleaned.length > 0 ? cleaned : "file";
}

export type PrepareTrainingUploadResult =
  | {
      ok: true;
      objectPath: string;
      contentType: string;
      byteSize: number;
      title: string;
      lessonId: string;
      sortOrder: number;
    }
  | { ok: false; state: AuthFormState };

/**
 * Validate permission + file meta and return a Storage object path.
 * The browser uploads the bytes directly to Supabase (avoids Next.js
 * Server Action multipart body limits / "Unexpected end of form").
 */
export async function prepareTrainingFileUploadAction(input: {
  lessonId: string;
  title: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  sortOrder?: number;
}): Promise<PrepareTrainingUploadResult> {
  const parsed = trainingFileMetaSchema.safeParse({
    lessonId: input.lessonId,
    title: input.title,
    sortOrder: input.sortOrder ?? 0,
  });
  if (!parsed.success) {
    return { ok: false, state: invalid(toFieldErrors(parsed.error)) };
  }

  if (!input.byteSize || input.byteSize <= 0) {
    return {
      ok: false,
      state: invalid({ file: ["Choose a PDF or document to upload."] }),
    };
  }
  if (input.byteSize > MAX_TRAINING_UPLOAD_BYTES) {
    return {
      ok: false,
      state: invalid({ file: ["File must be 50 MB or smaller."] }),
    };
  }
  const contentType = input.contentType || "application/octet-stream";
  if (!ALLOWED_TRAINING_UPLOAD_TYPES.has(contentType)) {
    return {
      ok: false,
      state: invalid({
        file: ["Upload a PDF, Word, Excel, or plain text file."],
      }),
    };
  }

  const membership = await requireActiveMembership();
  const supabase = await createClient();
  const { data: lesson } = await supabase
    .from("training_lessons")
    .select("course_id, archived_at")
    .eq("id", parsed.data.lessonId)
    .maybeSingle();
  if (!lesson || lesson.archived_at) {
    return { ok: false, state: failure("This lesson is not editable.") };
  }

  const ownership = await loadCourseOwnership(lesson.course_id);
  if (
    !ownership ||
    ownership.archivedAt ||
    !(await canManageTrainingLibrary(
      ownership.visibility,
      ownership.organizationId,
      membership,
    ))
  ) {
    return {
      ok: false,
      state: failure("You cannot upload files to this lesson."),
    };
  }

  const root =
    ownership.visibility === "platform"
      ? "platform"
      : ownership.organizationId;
  if (!root) {
    return { ok: false, state: failure("This course has no organization.") };
  }

  const objectPath = [
    root,
    lesson.course_id,
    parsed.data.lessonId,
    `${crypto.randomUUID()}-${sanitizeUploadFilename(input.fileName)}`,
  ].join("/");

  return {
    ok: true,
    objectPath,
    contentType,
    byteSize: input.byteSize,
    title: parsed.data.title,
    lessonId: parsed.data.lessonId,
    sortOrder: parsed.data.sortOrder,
  };
}

/** After a successful browser Storage upload, attach the object to the lesson. */
export async function registerTrainingFileAction(input: {
  lessonId: string;
  title: string;
  objectPath: string;
  contentType: string;
  byteSize: number;
  sortOrder?: number;
}): Promise<AuthFormState> {
  const parsed = trainingFileMetaSchema.safeParse({
    lessonId: input.lessonId,
    title: input.title,
    sortOrder: input.sortOrder ?? 0,
  });
  if (!parsed.success) return invalid(toFieldErrors(parsed.error));

  if (
    !input.objectPath ||
    input.objectPath.includes("..") ||
    input.objectPath.length > 512
  ) {
    return failure("Invalid upload path.");
  }
  if (input.byteSize > MAX_TRAINING_UPLOAD_BYTES || input.byteSize <= 0) {
    return invalid({ file: ["File must be 50 MB or smaller."] });
  }
  if (!ALLOWED_TRAINING_UPLOAD_TYPES.has(input.contentType)) {
    return invalid({
      file: ["Upload a PDF, Word, Excel, or plain text file."],
    });
  }

  const [user, membership] = await Promise.all([
    requireCurrentUser(),
    requireActiveMembership(),
  ]);
  const supabase = await createClient();
  const { data: lesson } = await supabase
    .from("training_lessons")
    .select("course_id, archived_at")
    .eq("id", parsed.data.lessonId)
    .maybeSingle();
  if (!lesson || lesson.archived_at) return failure("This lesson is not editable.");

  const ownership = await loadCourseOwnership(lesson.course_id);
  if (
    !ownership ||
    ownership.archivedAt ||
    !(await canManageTrainingLibrary(
      ownership.visibility,
      ownership.organizationId,
      membership,
    ))
  ) {
    return failure("You cannot upload files to this lesson.");
  }

  const expectedRoot =
    ownership.visibility === "platform"
      ? "platform"
      : ownership.organizationId;
  if (!expectedRoot || !input.objectPath.startsWith(`${expectedRoot}/`)) {
    return failure("Upload path does not match this course.");
  }
  if (!input.objectPath.includes(`/${parsed.data.lessonId}/`)) {
    return failure("Upload path does not match this lesson.");
  }

  const { error } = await supabase.from("training_resources").insert({
    lesson_id: parsed.data.lessonId,
    title: parsed.data.title,
    source: "file",
    url: null,
    storage_path: input.objectPath,
    content_type: input.contentType,
    byte_size: input.byteSize,
    sort_order: parsed.data.sortOrder,
    created_by: user.id,
  });

  if (error) {
    await supabase.storage.from("training-files").remove([input.objectPath]);
    return failure(mapWriteError(error.message));
  }

  revalidatePath(`/training/lessons/${parsed.data.lessonId}`);
  return { status: "success", message: "File uploaded for this lesson." };
}
