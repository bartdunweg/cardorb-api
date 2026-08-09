import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "binder",
  description: "A Pokemon card collection, and the API behind it.",
  // Nothing here is for search engines: it is one person's collection tool.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
