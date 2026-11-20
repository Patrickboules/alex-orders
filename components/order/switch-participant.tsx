"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { switchParticipantAction } from "@/lib/actions/participant";

export function SwitchParticipant() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await switchParticipantAction();
          router.refresh();
        })
      }
      className="-mx-1 inline-flex min-h-11 items-center rounded px-1 font-medium text-ink underline underline-offset-4 hover:text-accent disabled:opacity-50"
    >
      Not you? Switch
    </button>
  );
}
