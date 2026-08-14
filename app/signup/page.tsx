import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SignUpForm from "../components/SignUpForm";
import Card from "../components/Card";
import { currentViewer } from "../../lib/api/viewer";
import { APP_NAME } from "../../lib/core/config";
import "../styles/signin.css";

/**
 * Making an account.
 *
 * Its own page rather than a tab on the login, because the two screens are for
 * people in different situations and a tab makes you decide which one you are
 * before reading either. The links between them are at the bottom of both.
 *
 * noindex like the rest of this app, so a sign-up form does not become the
 * thing a search engine shows for the product's name.
 */
export const metadata: Metadata = { title: "Create an account" };
export const dynamic = "force-dynamic";

export default async function SignUp() {
  // Somebody already signed in has nothing to do here, and sending them to the
  // collection is kinder than a form that would refuse their own address.
  if (await currentViewer()) redirect("/cards");

  return (
    <section className="page-signin">
      <Card className="signin-card">
        <h1 className="page-title">Start a collection on {APP_NAME}</h1>
        <SignUpForm />
      </Card>
    </section>
  );
}
