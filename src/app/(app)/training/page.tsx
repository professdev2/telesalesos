import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { TrainingCourseCard } from "@/components/training/training-course-card";
import { TrainingCourseCreateForm } from "@/components/training/training-forms";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { canManageAgencyTraining, isPlatformAdmin } from "@/lib/training/access";
import {
  groupCoursesBySection,
  listTrainingCourses,
  type TrainingCourse,
} from "@/lib/training/queries";
import { requireActiveMembership } from "@/lib/org/active-org";

export const metadata: Metadata = {
  title: "Training | TelesalesOS",
};

export default async function Page() {
  const [membership, courses, platformAdmin] = await Promise.all([
    requireActiveMembership(),
    listTrainingCourses(),
    isPlatformAdmin(),
  ]);
  const canManageAgency = canManageAgencyTraining(membership);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Training"
        description={`Course catalog for ${membership.organizationName}. Open a course for Vimeo lessons and script downloads.`}
      />

      <TrainingLibrary
        title="TelesalesOS"
        description="Platform catalog shared across organizations. Watch-only unless you are a platform admin."
        courses={courses.platform}
        empty="No platform courses are published yet."
        createForm={
          platformAdmin ? (
            <TrainingCourseCreateForm visibility="platform" />
          ) : null
        }
      />

      <TrainingLibrary
        title={membership.organizationName}
        description={
          canManageAgency
            ? "Your organization’s private library. Set a section and thumbnail when adding a course; add Vimeo and downloads on each lesson."
            : "Your organization’s private library. Owners and admins manage content; members can watch and open downloads."
        }
        courses={courses.organization}
        empty={
          canManageAgency
            ? "No organization courses yet. Create one with an optional section and thumbnail, then add lessons."
            : "No organization courses yet."
        }
        createForm={
          canManageAgency ? (
            <TrainingCourseCreateForm visibility="organization" />
          ) : null
        }
      />
    </div>
  );
}

function TrainingLibrary({
  title,
  description,
  courses,
  empty,
  createForm,
}: {
  title: string;
  description: string;
  courses: TrainingCourse[];
  empty: string;
  createForm: React.ReactNode;
}) {
  const sections = groupCoursesBySection(courses);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {createForm}
        {courses.length === 0 ? (
          <p className="text-muted-foreground text-sm">{empty}</p>
        ) : (
          sections.map(({ section, courses: sectionCourses }) => (
            <div key={section} className="space-y-3">
              <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                {section}
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {sectionCourses.map((course) => (
                  <TrainingCourseCard key={course.id} course={course} />
                ))}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
