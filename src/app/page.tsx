import { ArrowRight, DoorOpen, House, HousePlus } from "lucide-react";
import { redirect } from "next/navigation";
import { barButtonClass, Frame } from "@/components/quilt/Frame";
import { StateMark } from "@/components/quilt/StateMark";
import { Stitch } from "@/components/quilt/Stitch";
import { getAccount } from "@/lib/account";
import { findFamily } from "@/lib/family";
import { homeFor } from "@/lib/home";
import { getDevicePerson, getSessionId } from "@/lib/session";
import type { Person } from "@/lib/session-cookie";
import styles from "./welcome.module.css";

// Who is signed in, and where an invited device belongs, are read per request.
export const dynamic = "force-dynamic";

/** The fabric the first door wears once we know who you are in the family; cornflower until then. */
function doorFabric(person: Person | null | undefined): "sarah" | "tom" | "rosa" {
  return person === "Tom" ? "tom" : person === "Rosa" ? "rosa" : "sarah";
}

/**
 * The front door: what Second Look is in three plain lines, and two ways in. Set up a family of your own (sign in, then
 * the setup), or look around the Hale family that is already set up. A device that was invited (Mom's tablet, the
 * sibling's or Rosa's phone) never sees the doors: it goes straight to its person's screen.
 */
export default async function Welcome({ searchParams }: { searchParams: Promise<{ join?: string }> }) {
  const [account, person, sessionId] = await Promise.all([getAccount(), getDevicePerson(), getSessionId()]);
  if (!account && person) {
    const home = await homeFor(sessionId, person, null);
    if (home) redirect(home);
  }
  const { join } = await searchParams;
  const family = account ? await findFamily(account.sessionId) : null;
  const setUp = Boolean(family?.settings.setupCompletedAt);
  const me = account?.person ?? null;

  const signOut = account ? (
    <form action="/signout" method="post">
      <button type="submit" className={barButtonClass}>
        Sign out
      </button>
    </form>
  ) : undefined;

  return (
    <Frame barEnd={signOut}>
      <div className={styles.welcome}>
        <header className={styles.head}>
          {join === "expired" && (
            <p className={styles.notice} role="status">
              That invite link has expired. Ask whoever sent it to you for a new one.
            </p>
          )}
          <h1 className={styles.tagline}>
            Mom pays her own bills. <span className={styles.taglineSecond}>The family gets a second look when something&rsquo;s off.</span>
          </h1>
          <p className={styles.intro}>A money desk for an ageing parent and her family, built on PayPal.</p>
        </header>

        <div className={styles.doors} role="group" aria-label="Two ways in">
          <a
            href="/api/account/home"
            className={styles.door}
            data-fabric={doorFabric(me)}
            aria-labelledby="door-family"
            aria-describedby="door-family-body door-family-meta"
          >
            <Stitch kind={doorFabric(me) === "tom" ? "sewn" : "light"} />
            {setUp ? <House className={styles.doorIcon} aria-hidden="true" /> : <HousePlus className={styles.doorIcon} aria-hidden="true" />}
            <span className={styles.doorText}>
              <span id="door-family" className={styles.doorTitle}>
                {account ? "Go to your family" : "Set up your family"}
                <ArrowRight className={styles.arrow} aria-hidden="true" />
              </span>
              <span id="door-family-body" className={styles.doorBody}>
                {!account
                  ? "You play Sarah or Tom. Sign in with your email, choose Mom’s bills and rules, then invite the family."
                  : !setUp
                    ? "Carry on setting up where you left off."
                    : me
                      ? `Open ${me}’s screen in your family.`
                      : "Open your family’s screens."}
              </span>
              <span id="door-family-meta" className={styles.doorMeta}>
                {!account ? "About two minutes" : me ? `Signed in as ${me}` : "Signed in on this device"}
              </span>
            </span>
          </a>

          <form action="/api/demo/ready" method="post" className={styles.doorForm}>
            <button
              type="submit"
              className={styles.door}
              data-fabric="margaret"
              aria-labelledby="door-ready"
              aria-describedby="door-ready-body door-ready-meta"
            >
              <Stitch kind="light" />
              <DoorOpen className={styles.doorIcon} aria-hidden="true" />
              <span className={styles.doorText}>
                <span id="door-ready" className={styles.doorTitle}>
                  See a family already set up
                  <ArrowRight className={styles.arrow} aria-hidden="true" />
                </span>
                <span id="door-ready-body" className={styles.doorBody}>
                  Meet the Hale family, all made up. Start on Margaret&rsquo;s screen, then switch to Sarah, Tom or Rosa at the
                  top.
                </span>
                <span id="door-ready-meta" className={styles.doorMeta}>
                  No sign-in
                </span>
              </span>
            </button>
          </form>
        </div>

        <section className={styles.how} aria-labelledby="how-heading">
          <h2 id="how-heading" className={styles.howHeading}>
            How it works
          </h2>
          <ul className={styles.rows}>
            <li className={styles.row}>
              <Stitch kind="sewn" />
              <StateMark state="settled" fabric="var(--margaret)" />
              <div>
                <p className={styles.rowTitle}>Her usual bills just go through</p>
                <p className={styles.rowDetail}>She says or taps who to pay. People she knows, under her limit, are paid by PayPal at once.</p>
              </div>
            </li>
            <li className={styles.row} data-waiting>
              <Stitch kind="basting" />
              <StateMark state="waiting" />
              <div>
                <p className={styles.rowTitle}>A payment that looks off waits for family</p>
                <p className={styles.rowDetail}>
                  PayPal holds the money until her son or daughter takes a second look. If they say no, it never left.
                </p>
              </div>
            </li>
            <li className={styles.row}>
              <Stitch kind="sewn" />
              <StateMark state="settled" fabric="var(--rosa)" />
              <div>
                <p className={styles.rowTitle}>Care costs are paid and split</p>
                <p className={styles.rowDetail}>Her aide is paid through PayPal for each week of visits, and each child gets a bill for their share.</p>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </Frame>
  );
}
