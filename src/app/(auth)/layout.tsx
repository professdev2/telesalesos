import Image from "next/image";
import Link from "next/link";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <Link href="/" aria-label="TelesalesOS home">
        <Image
          src="/telesalesos-logo-white.svg"
          alt="TelesalesOS"
          width={437}
          height={100}
          unoptimized
          className="h-auto w-56"
        />
      </Link>
      <div className="w-full max-w-md">{children}</div>
      <p className="text-muted-foreground max-w-md text-center text-xs">
        Protected system. Activity is logged for compliance purposes.
      </p>
    </div>
  );
}
