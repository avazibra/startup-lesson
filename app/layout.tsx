import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Startup Lesson",
  description: "Startup academy lesson flow with admin content and learner progress."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
