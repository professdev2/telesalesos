import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  // Must stay in sync with `--font-sans` in globals.css, which is what
  // Tailwind's `font-sans` resolves to.
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "TelesalesOS",
    template: "%s | TelesalesOS",
  },
  applicationName: "TelesalesOS",
  description:
    "The all-in-one CRM, quoting, communications, training, and operations platform for life insurance agents and agencies.",
  appleWebApp: {
    capable: true,
    title: "TelesalesOS",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      {/* Browser extensions (screen recorders, password managers) add
          attributes to <body> before React hydrates, which reads as a
          mismatch. This suppresses the warning for this element's own
          attributes only — real mismatches inside the app still surface. */}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
