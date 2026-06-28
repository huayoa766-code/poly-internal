import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
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
  title: "Poly Tracker",
  description: "Internal Polymarket bookmark tracker",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-neutral-950 text-neutral-100">
        <header className="border-b border-neutral-800 px-6 py-3 flex items-center gap-6">
          <Link href="/" className="font-semibold tracking-tight">
            📌 Poly Tracker
          </Link>
          <nav className="flex gap-4 text-sm text-neutral-400">
            <Link href="/" className="hover:text-neutral-100">
              Bookmarks
            </Link>
            <Link href="/search" className="hover:text-neutral-100">
              Find markets
            </Link>
          </nav>
        </header>
        <main className="flex-1 px-6 py-6 max-w-5xl w-full mx-auto">{children}</main>
      </body>
    </html>
  );
}
