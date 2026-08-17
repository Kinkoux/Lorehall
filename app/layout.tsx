import type { Metadata } from "next";
import { Cinzel, Alegreya_Sans } from "next/font/google";
import { getLocale } from "@/lib/locale";
import "./globals.css";

const display = Cinzel({
  variable: "--font-display",
  subsets: ["latin", "latin-ext"],
  weight: ["500", "700"],
});

const body = Alegreya_Sans({
  variable: "--font-body",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: { default: "Lorehall", template: "%s · Lorehall" },
  description: "A shared home for your D&D world, campaigns, and sessions.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // lang drives correct Turkish casing for CSS text-transform (i → İ).
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
