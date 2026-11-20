"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-20">
      <h1 className="text-xl font-semibold tracking-tight">This page didn’t load</h1>
      <p className="mt-2 text-ink-2">
        The server couldn’t fetch the data for this page. Check your connection and try again.
      </p>
      <Button variant="secondary" className="mt-6" onClick={() => retry()}>
        Try again
      </Button>
    </main>
  );
}
