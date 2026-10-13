import "server-only";

import { cache } from "react";

import { requireActiveMembership } from "@/lib/org/active-org";
import { createClient } from "@/lib/supabase/server";
import { canManageTrainingLibrary } from "@/lib/training/access";
import type { TrainingVisibility } from "@/lib/training/validation";

export type TrainingCourse = {
  id: string;
  visibility: TrainingVisibility;
  organizationId: string | null;
  name: string;
  description: string | null;
  section: string | null;
  thumbnailUrl: string | null;
  archivedAt: string | null;
  createdAt: string;
  lessonCount: number;
  canManage: boolean;
};

export type TrainingLesson = {
  id: string;
  courseId: string;
  title: string;
  vimeoVideoId: string;
  sortOrder: number;
  archivedAt: string | null;
  createdAt: string;
};

export type TrainingResource = {
  id: string;
  lessonId: string;
  title: string;
  source: "link" | "file";
  url: string | null;
  storagePath: string | null;
  contentType: string | null;
  byteSize: number | null;
  sortOrder: number;
  createdAt: string;
  /** Short-lived signed HTTPS URL for file downloads; null for links. */
  downloadUrl: string | null;
};

export type TrainingCourseDetail = TrainingCourse & {
  lessons: TrainingLesson[];
};

export type TrainingLessonDetail = TrainingLesson & {
  course: TrainingCourse;
  resources: TrainingResource[];
};

export const GENERAL_SECTION = "General";

type CourseRow = {
  id: string;
  visibility: TrainingVisibility;
  organization_id: string | null;
  name: string;
  description: string | null;
  section: string | null;
  thumbnail_url: string | null;
  archived_at: string | null;
  created_at: string;
};

type LessonRow = {
  id: string;
  course_id: string;
  title: string;
  vimeo_video_id: string;
  sort_order: number;
  archived_at: string | null;
  created_at: string;
};

const COURSE_COLUMNS =
  "id, visibility, organization_id, name, description, section, thumbnail_url, archived_at, created_at";

function mapLesson(row: LessonRow): TrainingLesson {
  return {
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    vimeoVideoId: row.vimeo_video_id,
    sortOrder: row.sort_order,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
  };
}

async function mapCourse(
  row: CourseRow,
  lessonCount: number,
): Promise<TrainingCourse> {
  const membership = await requireActiveMembership();
  return {
    id: row.id,
    visibility: row.visibility,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    section: row.section?.trim() ? row.section.trim() : null,
    thumbnailUrl: row.thumbnail_url,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    lessonCount,
    canManage: await canManageTrainingLibrary(
      row.visibility,
      row.organization_id,
      membership,
    ),
  };
}

/** Group courses by section for the catalog grid. Empty section → General. */
export function groupCoursesBySection(
  courses: TrainingCourse[],
): { section: string; courses: TrainingCourse[] }[] {
  const buckets = new Map<string, TrainingCourse[]>();
  for (const course of courses) {
    const key = course.section?.trim() || GENERAL_SECTION;
    const list = buckets.get(key) ?? [];
    list.push(course);
    buckets.set(key, list);
  }

  const sections = [...buckets.entries()].map(([section, items]) => ({
    section,
    courses: items,
  }));

  sections.sort((a, b) => {
    if (a.section === GENERAL_SECTION) return 1;
    if (b.section === GENERAL_SECTION) return -1;
    return a.section.localeCompare(b.section);
  });

  return sections;
}

export const listTrainingCourses = cache(async (): Promise<{
  platform: TrainingCourse[];
  organization: TrainingCourse[];
}> => {
  const membership = await requireActiveMembership();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("training_courses")
    .select(COURSE_COLUMNS)
    .or(
      `visibility.eq.platform,and(visibility.eq.organization,organization_id.eq.${membership.organizationId})`,
    )
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (error || !data) return { platform: [], organization: [] };

  const ids = data.map((row) => row.id);
  const counts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: lessons } = await supabase
      .from("training_lessons")
      .select("course_id")
      .in("course_id", ids)
      .is("archived_at", null);
    for (const lesson of lessons ?? []) {
      counts.set(lesson.course_id, (counts.get(lesson.course_id) ?? 0) + 1);
    }
  }

  const courses = await Promise.all(
    (data as CourseRow[]).map((row) =>
      mapCourse(row, counts.get(row.id) ?? 0),
    ),
  );

  return {
    platform: courses.filter((course) => course.visibility === "platform"),
    organization: courses.filter(
      (course) => course.visibility === "organization",
    ),
  };
});

export const getTrainingCourseById = cache(
  async (id: string): Promise<TrainingCourseDetail | null> => {
    const membership = await requireActiveMembership();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("training_courses")
      .select(COURSE_COLUMNS)
      .eq("id", id)
      .or(
        `visibility.eq.platform,and(visibility.eq.organization,organization_id.eq.${membership.organizationId})`,
      )
      .maybeSingle();

    if (error || !data) return null;

    const { data: lessonRows } = await supabase
      .from("training_lessons")
      .select(
        "id, course_id, title, vimeo_video_id, sort_order, archived_at, created_at",
      )
      .eq("course_id", id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    const lessons = (lessonRows as LessonRow[] | null)?.map(mapLesson) ?? [];
    const course = await mapCourse(
      data as CourseRow,
      lessons.filter((lesson) => !lesson.archivedAt).length,
    );
    return { ...course, lessons };
  },
);

export const getTrainingLessonById = cache(
  async (id: string): Promise<TrainingLessonDetail | null> => {
    await requireActiveMembership();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("training_lessons")
      .select(
        "id, course_id, title, vimeo_video_id, sort_order, archived_at, created_at",
      )
      .eq("id", id)
      .maybeSingle();

    if (error || !data) return null;

    const [course, resourceResult] = await Promise.all([
      getTrainingCourseById(data.course_id),
      supabase
        .from("training_resources")
        .select(
          "id, lesson_id, title, source, url, storage_path, content_type, byte_size, sort_order, created_at",
        )
        .eq("lesson_id", id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);

    if (!course) return null;

    const resources: TrainingResource[] = await Promise.all(
      (resourceResult.data ?? []).map(async (row) => {
        const source: TrainingResource["source"] =
          row.source === "file" ? "file" : "link";
        let downloadUrl: string | null = null;
        if (source === "file" && row.storage_path) {
          const { data: signed } = await supabase.storage
            .from("training-files")
            .createSignedUrl(row.storage_path, 60 * 30);
          downloadUrl = signed?.signedUrl ?? null;
        }
        return {
          id: row.id,
          lessonId: row.lesson_id,
          title: row.title,
          source,
          url: row.url,
          storagePath: row.storage_path,
          contentType: row.content_type,
          byteSize: row.byte_size,
          sortOrder: row.sort_order,
          createdAt: row.created_at,
          downloadUrl: source === "link" ? row.url : downloadUrl,
        };
      }),
    );

    return {
      ...mapLesson(data as LessonRow),
      course,
      resources,
    };
  },
);
