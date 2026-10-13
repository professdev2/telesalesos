import Link from "next/link";
import { GraduationCap } from "lucide-react";

import type { TrainingCourse } from "@/lib/training/queries";
import { cn } from "@/lib/utils";

export function TrainingCourseCard({ course }: { course: TrainingCourse }) {
  return (
    <Link
      href={`/training/courses/${course.id}`}
      className={cn(
        "border-border bg-card hover:bg-accent/40 group flex flex-col overflow-hidden rounded-lg border transition-colors",
      )}
    >
      <div className="bg-muted relative aspect-[16/10] w-full overflow-hidden">
        {course.thumbnailUrl ? (
          // External HTTPS thumbnails chosen by owners; next/image domains vary per agency.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={course.thumbnailUrl}
            alt=""
            className="size-full object-cover"
          />
        ) : (
          <div className="text-muted-foreground flex size-full items-center justify-center">
            <GraduationCap className="size-10 opacity-40" aria-hidden />
          </div>
        )}
      </div>
      <div className="space-y-1 p-3">
        <p className="group-hover:underline line-clamp-2 text-sm font-medium underline-offset-4">
          {course.name}
        </p>
        <p className="text-muted-foreground text-xs">
          {course.lessonCount} {course.lessonCount === 1 ? "lesson" : "lessons"}
        </p>
        {course.description ? (
          <p className="text-muted-foreground line-clamp-2 text-xs">
            {course.description}
          </p>
        ) : null}
      </div>
    </Link>
  );
}
