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
      <head>
        <link rel="preconnect" href="https://www.youtube.com" />
        <link rel="preconnect" href="https://i.ytimg.com" />
        <link rel="preconnect" href="https://s.ytimg.com" />
      </head>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `
try {
  var storedPreference = localStorage.getItem("theme");
  var preference = storedPreference === "light" || storedPreference === "dark" || storedPreference === "system" ? storedPreference : "system";
  var systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.dataset.theme = preference === "system" ? systemTheme : preference;
  document.documentElement.dataset.themePreference = preference;
} catch (_) {}
            `
          }}
        />
        {children}
      </body>
    </html>
  );
}
