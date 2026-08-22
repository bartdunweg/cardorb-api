import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import PasswordForm from "./_components/PasswordForm";
import SigninShell from "@/components/shared/SigninShell";
import { FormNote } from "@/components/shared/FormField";
import { currentViewer } from "@/lib/api/viewer";
import { RECOVERY_MARKER } from "@/lib/api/recovery";

/**
 * Setting a new password.
 *
 * Where a recovery link lands, by way of /auth/confirm, which is what turns the
 * token in the email into the session this page requires. It is also where
 * somebody signed in changes their password on purpose — the same screen for
 * both, because it is the same operation and the only difference is how you got
 * here.
 *
 * A viewer is required. Arriving without one means the link had expired by the
 * time it was opened, and the login says so.
 */
export const metadata: Metadata = { title: "Set a password" };
export const dynamic = "force-dynamic";

export default async function SetPassword() {
  const viewer = await currentViewer();
  if (!viewer) redirect("/login?error=That+link+has+expired.+Ask+for+a+new+one.");

  /**
   * Which of the two callers this is. /auth/confirm sets the marker when it
   * exchanges a `type=recovery` token, and only then — so its absence means
   * somebody signed in walked here deliberately, and can be asked for the
   * password they already have.
   *
   * Absence is the branch that asks for more, which is the safe way round: a
   * marker that fails to arrive shows a field somebody can fill, where a marker
   * wrongly present would hide one. Forging it gains
   * nothing — Supabase enforces the requirement from the parameter, not from
   * this.
   */
  const viaRecovery = (await cookies()).has(RECOVERY_MARKER);

  return (
    <SigninShell title="Set a new password">
      <FormNote>Signed in as {viewer.email}.</FormNote>
      <PasswordForm viaRecovery={viaRecovery} />
    </SigninShell>
  );
}
