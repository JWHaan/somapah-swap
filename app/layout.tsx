import type { Metadata } from "next";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { themeInitScript } from "@/lib/theme";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Somapah Swap",
    template: "%s | Somapah Swap",
  },
  description:
    "Seeded second-hand course, dorm, and tech listings for SUTD buyers.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <SiteHeader />
        <div className="site-content">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
