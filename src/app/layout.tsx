import "./globals.css";
import type { ReactNode } from "react";

import { AuthGate } from "@/components/auth/auth-gate";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
