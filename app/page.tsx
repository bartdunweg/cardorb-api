import { redirect } from "next/navigation";

/**
 * The collection lives at /cards, and this app is the collection, so / is only
 * ever on its way there.
 *
 * Kept as a route rather than moving the whole thing to / because the card
 * dialog is an intercepted parallel route (app/@modal/(.)cards/[id]) and the
 * interception is defined relative to the segment it intercepts. Moving the
 * list to / means rewriting that relationship for one character of URL.
 */
export default function Home() {
  redirect("/cards");
}
