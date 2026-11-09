import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Frame } from "@/components/quilt/Frame";
import { getAccount } from "@/lib/account";
import { SIGN_IN_MINUTES } from "@/lib/auth";
import { emailConfigured } from "@/lib/email";
import { SignInForm } from "./SignInForm";
import styles from "./signin.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in · Second Look",
};

/** The ready-made Hale family, no sign-in: the way on when email is off, and for anyone just looking. */
function ReadyFamily({ prominent = false }: { prominent?: boolean }) {
  return (
    <form action="/api/demo/ready" method="post" className={prominent ? styles.readyForm : styles.alt}>
      {prominent ? (
        <button type="submit" className={styles.ready}>
          See a family already set up
          <ArrowRight className={styles.arrow} aria-hidden="true" />
        </button>
      ) : (
        <>
          <span>Just looking?</span>{" "}
          <button type="submit" className={styles.textButton}>
            See a family already set up
          </button>
        </>
      )}
    </form>
  );
}

/**
 * Sign in by email, for whoever sets up a family (and anyone in it coming back on another device). Already signed in
 * on this device: straight on to the family.
 */
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ link?: string }> }) {
  if (await getAccount()) redirect("/api/account/home");
  const { link } = await searchParams;
  // Without Resend a development server shows the code on the page; a production one can't sign anyone in.
  const emailOff = !emailConfigured() && process.env.NODE_ENV === "production";

  return (
    <Frame>
      <div className={styles.stage}>
        <section className={styles.panel}>
          {emailOff ? (
            <>
              <h1 className={styles.heading}>Signing in isn&rsquo;t switched on here yet</h1>
              <p className={styles.lead}>
                For now you can&rsquo;t set up a family of your own on this site, but you can look around the Hale family,
                already set up: Margaret, her children Sarah and Tom, and Rosa, her aide.
              </p>
              <ReadyFamily prominent />
            </>
          ) : (
            <>
              <SignInForm minutes={SIGN_IN_MINUTES} linkExpired={link === "expired"} />
              <ReadyFamily />
            </>
          )}
        </section>
      </div>
    </Frame>
  );
}
