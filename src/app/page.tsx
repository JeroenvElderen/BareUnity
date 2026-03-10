"use client";

import Topbar from "@/components/Topbar";
import Sidebar from "@/components/Sidebar";
import Feed from "@/components/Feed";

export default function Home() {
  return (
    <div className="min-h-screen text-text">
      <Topbar />

      <div className="mx-auto max-w-[1400px]">
        <div className="flex">
          <Sidebar />

          <main className="flex-1 px-4 py-6 md:px-6">
            <div className="mx-auto max-w-2xl">
              <Feed />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
