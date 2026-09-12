import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host");
  const protocol =
    requestHeaders.get("x-forwarded-proto") ||
    (host?.startsWith("localhost") ? "http" : "https");
  const baseUrl = new URL(`${protocol}://${host || "localhost:3000"}`);

  return {
    metadataBase: baseUrl,
    title: {
      default: "Join Scout Night School Map",
      template: "%s · Capitol Area Council",
    },
    description:
      "Explore Fall Recruitment schools, Join Scout Night details, and council geography across Central Texas.",
    openGraph: {
      title: "Join Scout Night School Map",
      description:
        "An interactive map of Fall Recruitment schools and Join Scout Night details in Central Texas.",
      type: "website",
    },
    twitter: {
      card: "summary",
      title: "Join Scout Night School Map",
      description:
        "Explore Fall Recruitment schools and Join Scout Night details across the Capitol Area Council.",
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
