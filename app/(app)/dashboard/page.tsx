import type { Metadata } from "next";
import DashboardScreen from "../../components/DashboardScreen";

/**
 * Where you land, signed in.
 *
 * Landing here was tried once and rolled back, and the reason was written down
 * rather than forgotten: "you arrived at four numbers and a chart and pressed
 * once more to reach what you came for." That objection is correct about a
 * dashboard that is only a summary, and it is answered by what the screen is
 * rather than by moving it — see DashboardScreen, where the doing comes first
 * and the counting is the footer.
 *
 * Two things also changed underneath it. An account can now be new, and landing
 * a new account on an empty grid is landing it on nothing. And there are things
 * to do — import, share — that had no home at all.
 */
export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return <DashboardScreen />;
}
