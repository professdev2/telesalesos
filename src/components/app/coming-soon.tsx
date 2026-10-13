import { Lock } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Placeholder for navigation targets that are not built yet.
 *
 * These render no data at all. A screen showing invented contacts or calls
 * reads as working software and sets an expectation the sprint has not earned.
 */
export function ComingSoon({
  title,
  description,
  plannedFor,
}: {
  title: string;
  description: string;
  plannedFor: string;
}) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <span className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full">
            <Lock className="size-4" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-medium">Not built yet</p>
            <p className="text-muted-foreground mt-0.5 max-w-sm text-sm">
              {plannedFor}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
