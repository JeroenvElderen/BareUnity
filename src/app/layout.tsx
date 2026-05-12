import "./globals.css";
import type { ReactNode } from "react";
import { headers } from "next/headers";

import { AuthGate } from "@/components/auth/auth-gate";
import { ContentProtection } from "@/components/security/content-protection";
import { FeedbackBubble } from "@/components/feedback/feedback-bubble";

export default async function RootLayout({ children }: { children: ReactNode }) {
  await headers();

  return (
    <html lang="en">
      <body>
        <ContentProtection />
        <AuthGate>
          {children}
          <FeedbackBubble />
        </AuthGate>
      </body>
    </html>
  );
}
