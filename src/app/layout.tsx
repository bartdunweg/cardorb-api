/**
 * The root layout Next requires, and nothing more. This deployment serves an
 * API: every route under /api and the contract at /openapi.yaml. There is no
 * page to dress, so there is no stylesheet, no font and no provider here.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
