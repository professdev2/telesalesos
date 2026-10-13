import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/app/page-header";
import {
  TrainingCourseEditForm,
  TrainingLessonCreateForm,
} from "@/components/training/training-forms";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireActiveMembership } from "@/lib/org/active-org";
import { getTrainingCourseById } from "@/lib/training/queries";

export const metadata: Metadata = {
  title: "Training course | TelesalesOS",
};

export default async function TrainingCoursePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [membership, { id }] = await Promise.all([
    requireActiveMembership(),
    params,
  ]);
  const course = await getTrainingCourseById(id);
  if (!course) notFound();

  const lessons = course.archivedAt
    ? course.lessons
    : course.lessons.filter((lesson) => !lesson.archivedAt);

  return (
    <div className="space-y-4">
      <PageHeader
        title={course.name}
        description={
          course.visibility === "platform"
            ? "TelesalesOS platform course."
            : `Private course for ${membership.organizationName}.`
        }
      />

      {course.section || course.thumbnailUrl ? (
        <div className="flex flex-wrap items-center gap-3">
          {course.section ? (
            <p className="text-muted-foreground text-sm">
              Section: <span className="text-foreground">{course.section}</span>
            </p>
          ) : null}
          {course.thumbnailUrl ? (
            <div className="border-border size-16 overflow-hidden rounded-md border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={course.thumbnailUrl}
                alt=""
                className="size-full object-cover"
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <Link
        href="/training"
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        Back to training
      </Link>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Course details</CardTitle>
          <CardDescription>
            {course.archivedAt
              ? "Archived. Hidden from the default catalog; historical URLs remain available to permitted viewers."
              : course.description ?? "No description."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {course.canManage ? (
            <TrainingCourseEditForm course={course} />
          ) : (
            <p className="text-muted-foreground text-sm">
              {course.visibility === "platform"
                ? "TelesalesOS platform courses are read-only here. To add your own Vimeo lessons and script downloads, create a course under your organization’s library on Training."
                : "This library is read-only for your account. Ask an owner or admin to add lessons and resources."}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Lessons</CardTitle>
          <CardDescription>
            Paste a Vimeo URL when adding a lesson. Open a lesson to attach
            script/PDF download links. Archived lessons are hidden while the
            course is active.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {course.canManage && !course.archivedAt ? (
            <TrainingLessonCreateForm courseId={course.id} />
          ) : null}

          {lessons.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {course.canManage && !course.archivedAt
                ? "No lessons yet. Use Add lesson above — title + Vimeo URL — then open the lesson to add a script download link."
                : "No lessons in this course yet."}
            </p>
          ) : (
            <ol className="divide-border divide-y">
              {lessons.map((lesson) => (
                <li key={lesson.id} className="py-2 first:pt-0 last:pb-0">
                  <Link
                    href={`/training/lessons/${lesson.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {lesson.title}
                  </Link>
                  <p className="text-muted-foreground text-sm">
                    Order {lesson.sortOrder}
                    {lesson.archivedAt ? " · Archived" : ""}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
