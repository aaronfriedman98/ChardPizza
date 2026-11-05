import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://chardpizza.netlify.app"),
  title: "Char'd Pizza",
  description: "Thin, crispy, New Haven-style pizza from Southfield, Michigan. Made to order on sale nights.",
  openGraph: {
    title: "Char'd Pizza",
    description: "Thin, crispy, New Haven-style pizza from Southfield, Michigan. Made to order on sale nights.",
    siteName: "Char'd Pizza",
    type: "website",
    images: [{ url: "/media/hero-oven.jpg", width: 1280, height: 720, alt: "The Char'd oven" }],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
