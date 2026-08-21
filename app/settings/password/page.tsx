import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PasswordForm from "@/components/custom/PasswordForm";
import SigninShell from "@/components/custom/SigninShell";
import { FormNote } from "@/components/custom/FormField";
import { currentViewer } from "../../../lib/api/viewer";

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

  return (
    <SigninShell title="Set a new password">
      <FormNote>Signed in as {viewer.email}.</FormNote>
      <PasswordForm />
    </SigninShell>
  );
}
