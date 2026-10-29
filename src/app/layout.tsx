import type { Metadata } from "next";
import { Manrope, Playfair_Display } from "next/font/google";
import Link from "next/link";

import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin", "cyrillic"],
  weight: "500",
});

export const metadata: Metadata = {
  title: {
    default: "Личная CRM",
    template: "%s · Личная CRM",
  },
  description: "Контакты людей, которых я знаю лично",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${manrope.variable} ${playfair.variable} h-full bg-cobalt antialiased`}>
      {/* As on the landing: a blue header, then a cream sheet with rounded top corners */}
      <body className="flex min-h-full flex-col bg-cobalt">
        <header className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-gutter sm:h-20">
          <Link
            href="/"
            className="rounded-sm text-logo font-bold text-cream focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cream sm:text-logo-lg"
          >
            Личная CRM
          </Link>
          <span aria-hidden className="size-2.5 rounded-full bg-cream" />
        </header>
        <main className="flex-1 rounded-t-section bg-background sm:rounded-t-section-lg">
          <div className="mx-auto w-full max-w-3xl px-gutter pt-8 pb-12 sm:pt-12 sm:pb-16">{children}</div>
        </main>
      </body>
    </html>
  );
}
