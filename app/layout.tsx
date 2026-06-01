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
    <html lang="en" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `
try {
  var storedTheme = localStorage.getItem("theme");
  var preferredTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.dataset.theme = storedTheme || preferredTheme;
} catch (_) {}
            `
          }}
        />
        {children}
      </body>
    </html>
  );
}
