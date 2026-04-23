import "./globals.css";
import type { ReactNode } from "react";

import { AuthGate } from "@/components/auth/auth-gate";
import { ContentProtection } from "@/components/security/content-protection";
import { MessagesOverlay } from "@/components/messages/messages-overlay";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ContentProtection />
        <AuthGate>
          {children}
          <MessagesOverlay />
        </AuthGate>
      </body>
    </html>
  );
}
