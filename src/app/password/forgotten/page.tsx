import type { Metadata } from "next";
import ForgottenForm from "@/components/shared/ForgottenForm";
import SigninShell from "@/components/shared/SigninShell";
import { APP_NAME } from "@/lib/core/config";

/**
 * Asking for a way back in.
 *
 * Deliberately says nothing about whether an address is known here, before or
 * after. The endpoint behind it answers the same either way; a page that then
 * showed "we've sent it" only for real accounts would give away exactly what
 * the endpoint took care not to.
 */
export const metadata: Metadata = { title: "Forgotten password" };

export default function Forgotten() {
  return (
    <SigninShell title={`Get back into ${APP_NAME}`}>
      <ForgottenForm />
    </SigninShell>
  );
}
