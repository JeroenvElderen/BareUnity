import Link from "next/link";

export default function VerifiedPage() {
  return (
    <main className="min-h-screen bg-[#f6f7f4] px-6 py-16 text-[#1f3326]">
      <section className="mx-auto flex max-w-xl flex-col items-center rounded-3xl border border-[#dfe7d8] bg-white p-10 text-center shadow-sm">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#345f45] text-3xl text-white">
          ✓
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Your email has been verified successfully.
        </h1>
        <p className="mt-4 text-base leading-7 text-[#516357]">
          You can now sign in and continue setting up your Naturist Platform
          account.
        </p>
        <Link
          href="/login"
          className="mt-8 rounded-full bg-[#345f45] px-6 py-3 font-semibold text-white transition hover:bg-[#2b4f39] focus:outline-none focus:ring-2 focus:ring-[#345f45] focus:ring-offset-2"
        >
          Back to login
        </Link>
      </section>
    </main>
  );
}
