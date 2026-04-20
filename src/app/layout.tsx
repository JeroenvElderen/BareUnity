import "./globals.css";
import type { ReactNode } from "react";

import { AuthGate } from "@/components/auth/auth-gate";
import { ContentProtection } from "@/components/security/content-protection";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ContentProtection />
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
