import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

// Designed by the Braille Institute for low-vision readers; Margaret's screen is held to WCAG AAA.
const atkinson = Atkinson_Hyperlegible_Next({
  subsets: ["latin"],
  weight: ["400", "700", "800"],
  variable: "--font-atkinson",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Second Look",
  description: "Mom pays her own bills. The family gets a second look when something’s off.",
};

export const viewport: Viewport = {
  themeColor: "#3b1f3a",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={atkinson.variable}>
      <body>{children}</body>
    </html>
  );
}
