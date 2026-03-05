import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Bay Area BMW Tracker",
  description: "Track BMW 330i and M340i inventory across Bay Area dealerships",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} min-h-screen bg-bmw-dark`}>
        {children}
      </body>
    </html>
  );
}
