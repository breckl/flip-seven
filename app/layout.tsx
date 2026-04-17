import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Flip 7",
  description: "Press-your-luck card game for 3+ players",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${dmSans.variable} h-full overflow-x-hidden`}>
      <body className="min-h-full overflow-x-hidden bg-white text-stone-900 antialiased">
        {children}
      </body>
    </html>
  );
}
