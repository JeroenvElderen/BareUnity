"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";
import styles from "./welcome.module.css";

export default function WelcomePage() {
  const router = useRouter();

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        router.replace("/");
      }
    });
  }, [router]);

  return (
    <main className={styles.main}>
      <div className={styles.aura} />
      <section className={styles.shell}>
        <p className={styles.brand}>
          <Image
            src="/logo.png"
            alt=""
            width={1254}
            height={1254}
            className={styles.brandLogo}
            priority
          />
          <span>BareUnity • Naturist Community</span>
        </p>
        <article className={styles.card}>
          <p className={styles.kicker}>Private • Consent-first • Real community</p>
          <h1 className={styles.title}>Welcome to BareUnity</h1>
          <p className={styles.subtitle}>
            A minimal, peaceful social space for naturist-minded people. Connect respectfully, explore places, and
            share moments without sexualization.
          </p>
          <div className={styles.actions}>
            <Link href="/register" className={styles.primaryAction}>
              Join now
            </Link>
            <Link href="/login" className={styles.secondaryAction}>
              Login
            </Link>
          </div>
          <p className={styles.note}>Your boundaries and privacy stay in your control.</p>
          <p className={styles.policyLinks}>
            <Link href="/policies">Privacy, Terms, Safety & Legal Policies</Link>
          </p>
        </article>
      </section>
    </main>
  );
}