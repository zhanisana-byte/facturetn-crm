"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function DigigoRootRedirect() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const token = params.get("token");
    const state = params.get("state");
    const code = params.get("code");
    const error = params.get("error");

    if (token || (state && code) || error) {
      router.replace("/digigo/redirect?" + params.toString());
    }
  }, [params, router]);

  return null;
}
