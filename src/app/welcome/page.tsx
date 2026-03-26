import Link from "next/link";

import styles from "../welcome.module.css";

export default function WelcomePage() {
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>🌿 BareUnity • Members only</p>
        <h1 className={styles.title}>Welcome to BareUnity</h1>
        <p className={styles.description}>
          Please sign in or create an account before entering the platform. Guest access is disabled.
        </p>
        <div className={styles.actions}>
          <Link href="/login" className={styles.signIn}>
            Sign in
          </Link>
          <Link href="/register" className={styles.register}>
            Register
          </Link>
        </div>
      </section>
    </main>
  );
}