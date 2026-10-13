import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-muted-foreground text-sm font-medium">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        The page you are looking for does not exist or you do not have access to it.
      </p>
      <Link href="/dashboard" className={buttonVariants()}>
        Go to dashboard
      </Link>
    </div>
  );
}
