import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentViewer } from "../../../lib/api/viewer";
import AccountSettings from "../../components/AccountSettings";

export const metadata: Metadata = { title: "Account" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const viewer = await currentViewer();
  if (!viewer) redirect("/login?next=/settings/account");

  return <AccountSettings email={viewer.email} username={viewer.username} />;
}
