"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import styles from "./auth.module.css";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error("Unhandled application error", error);
  }, [error]);

  return (
    <main className={styles.authPage}>
      <section className={styles.authCard}>
        <h1>We couldn&apos;t load this page.</h1>
        <p>
          Something went wrong while opening BareUnity. Please try again.
        </p>
        <Button type="button" onClick={reset}>
          Retry
        </Button>
      </section>
    </main>
  );
}