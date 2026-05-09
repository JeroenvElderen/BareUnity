import "./globals.css";
import type { ReactNode } from "react";

import { AuthGate } from "@/components/auth/auth-gate";
import { ContentProtection } from "@/components/security/content-protection";
import { MessagesOverlay } from "@/components/messages/messages-overlay";
import { FeedbackBubble } from "@/components/feedback/feedback-bubble";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ContentProtection />
        <AuthGate>
          {children}
          <MessagesOverlay />
          <FeedbackBubble />
        </AuthGate>
      </body>
    </html>
  );
}
