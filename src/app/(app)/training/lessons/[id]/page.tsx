import type { Metadata } from "next";
import Link from "next/link";
import { Download, ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";

import {
  TrainingLessonEditForm,
  TrainingResourceCreateForm,
} from "@/components/training/training-forms";
import { VimeoHoverPlayer } from "@/components/training/vimeo-hover-player";
import { buttonVariants } from "@/components/ui/button";
import { requireActiveMembership } from "@/lib/org/active-org";
import { getTrainingLessonById } from "@/lib/training/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Training lesson | TelesalesOS",
};

export default async function TrainingLessonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [, { id }] = await Promise.all([requireActiveMembership(), params]);
  const lesson = await getTrainingLessonById(id);
  if (!lesson) notFound();

  const historical = Boolean(
    lesson.archivedAt || lesson.course.archivedAt,
  );
  const canEdit = lesson.course.canManage && !historical;
  const canManage = lesson.course.canManage;

  return (
    <div className="grid h-[calc(100svh-3.5rem-2rem)] grid-rows-[auto_minmax(12rem,1fr)_auto] gap-2 overflow-hidden">
      <div className="space-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Link
            href={`/training/courses/${lesson.courseId}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Back to course
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight">
              {lesson.title}
            </h1>
            <p className="text-muted-foreground truncate text-xs">
              {lesson.course.name}
              {historical ? " · Archived history" : ""}
              {" · "}
              Vimeo only · no progress tracking
            </p>
          </div>
        </div>

        {canManage ? <TrainingLessonEditForm lesson={lesson} compact /> : null}
      </div>

      <div className="flex min-h-[12rem] w-full items-center justify-center overflow-hidden rounded-lg bg-black [container-type:size]">
        <div className="relative aspect-video max-h-full w-[min(100%,calc(100cqh*16/9))]">
          <VimeoHoverPlayer videoId={lesson.vimeoVideoId} title={lesson.title} />
        </div>
      </div>

      <div className="border-border space-y-1.5 border-t pt-2">
        <p className="text-muted-foreground text-xs">
          Downloads for this lesson · upload a PDF/doc or paste an HTTPS link
        </p>

        {lesson.resources.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {canEdit
              ? "No downloads yet. Upload a script PDF below, or add an external link."
              : "No downloads for this lesson."}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:gap-x-8 sm:gap-y-1">
            {lesson.resources.map((resource) => {
              const href = resource.downloadUrl;
              const isFile = resource.source === "file";
              return (
                <li key={resource.id} className="min-w-0 sm:max-w-md">
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={isFile ? true : undefined}
                      className="inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4"
                    >
                      {resource.title}
                      {isFile ? (
                        <Download aria-hidden className="size-3.5 shrink-0" />
                      ) : (
                        <ExternalLink aria-hidden className="size-3.5 shrink-0" />
                      )}
                    </a>
                  ) : (
                    <span className="text-muted-foreground text-sm">
                      {resource.title} (unavailable)
                    </span>
                  )}
                  <p className="text-muted-foreground text-xs">
                    {isFile
                      ? "Hosted file · opens with a secure link"
                      : resource.url}
                  </p>
                </li>
              );
            })}
          </ul>
        )}

        {canEdit ? (
          <TrainingResourceCreateForm lessonId={lesson.id} compact />
        ) : null}
      </div>
    </div>
  );
}
