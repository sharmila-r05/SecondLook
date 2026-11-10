import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { FamilyAlerts } from "@/components/push/FamilyAlerts";
import { LiveRefresh } from "@/components/push/LiveRefresh";
import { Frame } from "@/components/quilt/Frame";
import { InviteCard } from "@/components/setup/InviteCard";
import { getAccount } from "@/lib/account";
import { type Family, findFamily } from "@/lib/family";
import { demoSavedPayPalAvailable } from "@/lib/family-setup";
import { formatUsd } from "@/lib/money";
import { vapidPublicKey } from "@/lib/push";
import { publicOrigin } from "@/lib/redirect";
import { getSessionId } from "@/lib/session";
import { type Person, screenOf } from "@/lib/session-cookie";
import { holdWords, SETUP_STEPS, type SetupStep } from "@/lib/settings";
import { type BillRow, type Devices, getBillChoices, getDevices, type Invite } from "@/lib/setup-view";
import { chooseOrganizer, finishSetupStep, skipToDemoPayPal } from "./actions";
import { BillsForm } from "./BillsForm";
import { CareForm } from "./CareForm";
import { PendingButton } from "./fields";
import { Progress, type ProgressStep } from "./Progress";
import { RulesForm } from "./RulesForm";
import { SetupShell } from "./SetupShell";
import styles from "./setup.module.css";
import { WhoButtons } from "./WhoButtons";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Set up Mom’s family · Second Look" };

type Organizer = "Sarah" | "Tom";

const STEP_LABEL: Record<SetupStep, string> = { bills: "Bills", rules: "Rules", care: "Care", devices: "Invites" };
const STEP_TITLE: Record<SetupStep, string> = {
  bills: "Mom’s regular bills",
  rules: "What gets a second look",
  care: "Care costs",
  devices: "Invite the family",
};

const whole = (cents: number) => formatUsd(cents).replace(/\.00$/, "");
const siblingOf = (organizer: Organizer): Organizer => (organizer === "Sarah" ? "Tom" : "Sarah");
const he = (person: Organizer) => (person === "Tom" ? "He" : "She");
const his = (person: Organizer) => (person === "Tom" ? "his" : "her");

function sarahShare(family: Family): number {
  const sarah = family.members.find((m) => m.name === "Sarah");
  return (sarah && family.settings.split[sarah.id]) ?? 50;
}

function names(list: string[]): string {
  return list.length <= 1 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/** What was chosen at each step, for the column of blocks beside the form on a wide screen. */
function summaryOf(step: SetupStep, family: Family, bills: BillRow[], devices: Devices | null): string {
  const s = family.settings;
  switch (step) {
    case "bills": {
      const chosen = bills.filter((b) => b.chosen).map((b) => b.name);
      return chosen.length > 0 ? names(chosen) : "None: every payment gets a second look";
    }
    case "rules":
      return `Over ${whole(s.limitCents)}, or ${whole(s.dailyLimitCents)} in a day · ${holdWords(s.holdMinutes)} to answer`;
    case "care": {
      const share = sarahShare(family);
      return `${formatUsd(s.visitRateCents)} a visit · Sarah ${share}%, Tom ${100 - share}%`;
    }
    case "devices": {
      const joined = devices?.invites.filter((i) => i.joinedAt).length ?? 0;
      const all = devices?.invites.length ?? 3;
      return joined === all ? "Everyone has opened theirs" : `${joined} of ${all} opened`;
    }
  }
}

/** The four blocks: sewn up to where the organizer has reached, the next one open, the rest unsewn. */
function progressSteps(family: Family, bills: BillRow[], reached: SetupStep, devices: Devices | null): ProgressStep[] {
  const done = family.settings.setupCompletedAt !== null;
  const at = SETUP_STEPS.indexOf(reached);
  return SETUP_STEPS.map((key, i) => {
    const sewn = key === "devices" ? Boolean(devices && devices.invites.every((inv) => inv.joinedAt)) : i < at;
    return {
      key,
      label: STEP_LABEL[key],
      summary: summaryOf(key, family, bills, devices),
      state: sewn ? "sewn" : i === at ? "open" : "unsewn",
      href: !done && i <= at ? `/setup?step=${key}` : undefined,
    };
  });
}

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const account = await getAccount();
  if (!account) redirect("/signin");
  const sessionId = await getSessionId();
  if (account.sessionId !== sessionId) redirect("/api/account/home");

  const family = await findFamily(sessionId);
  if (!family || family.settings.origin !== "setup") return <WhoAreYou />;
  const organizer = family.members.find((m) => m.id === family.settings.organizerId)?.name;
  if (organizer !== "Sarah" && organizer !== "Tom") return <WhoAreYou />;
  if (account.person !== organizer) {
    // Sending them home would only bring them back here while the family isn't set up (their screen waits for it).
    if (!family.settings.setupCompletedAt) return <StillSettingUp organizer={organizer} />;
    redirect("/api/account/home");
  }

  const { step: asked } = await searchParams;
  const bills = await getBillChoices(family);

  // Once set up, only the invites stay here; the rules are changed from the family's Rules tab.
  if (family.settings.setupCompletedAt) {
    if (asked !== "devices") redirect(screenOf(organizer));
    const devices = await getDevices(family, sessionId, publicOrigin(await headers()));
    return <Invites family={family} organizer={organizer} devices={devices} steps={progressSteps(family, bills, "devices", devices)} />;
  }

  const saved = family.settings.setupStep;
  const reached: SetupStep = saved && saved !== "devices" ? saved : "bills";
  const wanted = SETUP_STEPS.find((s) => s === asked);
  // Never ahead of where the organizer has reached: a typed or old link lands on the step they're at.
  if (asked !== undefined && (!wanted || SETUP_STEPS.indexOf(wanted) > SETUP_STEPS.indexOf(reached))) redirect(`/setup?step=${reached}`);
  const step = wanted ?? reached;
  const sibling = siblingOf(organizer);
  const back = (to: SetupStep) => ({ href: `/setup?step=${to}`, label: to === "bills" ? "Back to Mom’s bills" : "Back to the rules" });

  return (
    <SetupShell startOver={organizer}>
      <div className={styles.stage}>
        <Progress steps={progressSteps(family, bills, reached, null)} here={step} organizer={organizer} />
        <div className={styles.panel}>
          {step === "bills" && (
            <>
              <header className={styles.intro}>
                <h1 className={styles.heading}>{STEP_TITLE.bills}</h1>
                <p className={styles.lead}>
                  Tick the bills Mom pays herself and what each usually comes to. When one comes in near its usual amount, it goes straight
                  through. Anyone new gets a second look from you first.
                </p>
              </header>
              <BillsForm rows={bills} preselect={reached === "bills" && bills.every((b) => !b.chosen)} />
              {reached === "bills" && (
                <form action={chooseOrganizer} className={styles.quietForm}>
                  <input type="hidden" name="person" value={sibling} />
                  <p className={styles.note}>
                    Not {organizer}?{" "}
                    <PendingButton className={styles.textButton} pending="Starting again…">
                      Start again as {sibling}
                    </PendingButton>
                  </p>
                </form>
              )}
            </>
          )}

          {step === "rules" && (
            <>
              <header className={styles.intro}>
                <h1 className={styles.heading}>{STEP_TITLE.rules}</h1>
                <p className={styles.lead}>
                  Mom&rsquo;s payments go straight through unless one of these is true. Then PayPal holds the money, and nothing is paid
                  until one of you says yes.
                </p>
              </header>
              <RulesForm
                initial={{
                  limitCents: family.settings.limitCents,
                  dailyLimitCents: family.settings.dailyLimitCents,
                  unusualMultiple: family.settings.unusualMultiple,
                  holdMinutes: family.settings.holdMinutes,
                  ask: family.settings.ask,
                }}
                organizer={organizer}
                sibling={sibling}
                back={back("bills")}
              />
            </>
          )}

          {step === "care" && (
            <>
              <header className={styles.intro}>
                <h1 className={styles.heading}>{STEP_TITLE.care}</h1>
                <p className={styles.lead}>
                  Rosa, Mom&rsquo;s aide, checks in on her phone at each visit. When one of you closes the week, PayPal pays Rosa and
                  sends you and {sibling} an invoice each for your share.
                </p>
              </header>
              <CareForm
                initialRateCents={family.settings.visitRateCents}
                initialSarahShare={sarahShare(family)}
                organizer={organizer}
                back={back("rules")}
              />
            </>
          )}
        </div>
      </div>
    </SetupShell>
  );
}

const CAST: { name: Person; role: string; fabric: string }[] = [
  { name: "Margaret", role: "Mom", fabric: "margaret" },
  { name: "Sarah", role: "her daughter", fabric: "sarah" },
  { name: "Tom", role: "her son", fabric: "tom" },
  { name: "Rosa", role: "her aide", fabric: "rosa" },
];

/** Step 0: the organizer says who they are, and that starts the family. */
function WhoAreYou() {
  return (
    <SetupShell>
      <div className={styles.stage}>
        <div className={styles.panel}>
          <header className={styles.intro}>
            <h1 className={styles.heading}>Who are you?</h1>
            <p className={styles.lead}>
              You&rsquo;re setting up Second Look for Mom, Margaret. Pick who you are: you&rsquo;ll set the family up, and everyone else
              gets an invite at the end.
            </p>
          </header>
          <form action={chooseOrganizer} className={styles.who}>
            <WhoButtons />
          </form>
          <section className={styles.cast} aria-labelledby="cast-heading">
            <h2 id="cast-heading" className={styles.castTitle}>
              A made-up family
            </h2>
            <p className={styles.help}>
              Second Look always plays the same four people. Each one has a PayPal sandbox account, so every payment here is a real
              PayPal step, with no real money.
            </p>
            <ul className={styles.castList}>
              {CAST.map((p) => (
                <li key={p.name} className={styles.castItem}>
                  <span className={`${styles.swatch} ${styles.fabric}`} data-fabric={p.fabric} aria-hidden="true" />
                  <strong>{p.name}</strong>
                  <span>{p.role}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </SetupShell>
  );
}

/** Someone else in the family signed in while the organizer is still setting it up. */
function StillSettingUp({ organizer }: { organizer: Organizer }) {
  return (
    <SetupShell>
      <LiveRefresh everyMs={6000} />
      <div className={styles.stage}>
        <div className={styles.panel}>
          <header className={styles.intro}>
            <h1 className={styles.heading}>{organizer} is setting up Mom&rsquo;s family</h1>
            <p className={styles.lead}>
              Your screen opens here on its own as soon as {he(organizer).toLowerCase()}&rsquo;s done. There&rsquo;s nothing for you to
              do until then.
            </p>
          </header>
        </div>
      </div>
    </SetupShell>
  );
}

const DEVICE: Record<Person, "tablet" | "phone"> = { Margaret: "tablet", Sarah: "phone", Tom: "phone", Rosa: "phone" };

/** After the care step: each person's link and code, whether they've opened it, Mom's two steps, and Done. */
function Invites({ family, organizer, devices, steps }: { family: Family; organizer: Organizer; devices: Devices; steps: ProgressStep[] }) {
  const sibling = siblingOf(organizer);
  const askWho = family.settings.ask === "everyone" ? `you or ${sibling}` : "you";
  const momReady = devices.momAgreed && devices.momConnectedPayPal;
  const canSkip = demoSavedPayPalAvailable() && !devices.momConnectedPayPal;

  const card = (invite: Invite) => {
    const shared = { person: invite.person, relation: invite.relation, device: DEVICE[invite.person], url: invite.url, qrSvg: invite.qrSvg, joinedAt: invite.joinedAt };
    if (invite.person === "Margaret") {
      return (
        <InviteCard
          key={invite.person}
          {...shared}
          message="Mom, this opens Second Look on your tablet. Tap it once and it stays there."
          checks={[
            { done: devices.momAgreed, text: devices.momAgreed ? "Said yes to Second Look" : "Hasn’t said yes to Second Look yet" },
            { done: devices.momConnectedPayPal, text: devices.momConnectedPayPal ? "Her PayPal is connected" : "Her PayPal isn’t connected yet" },
          ]}
          about={
            momReady
              ? `Mom is all set. Her regular bills go straight through, and anything unusual waits for ${askWho}.`
              : devices.momAgreed
                ? "Mom said yes. Next, on her tablet, she connects her PayPal once, so her bills can be paid from it."
                : devices.momConnectedPayPal
                  ? "Her PayPal is ready. On her tablet, Mom reads what Second Look does and says yes; she can pay bills here after that."
                  : "Mom does both on her tablet, once: she reads what Second Look does and says yes, then connects her PayPal so her bills can be paid from it."
          }
        >
          {canSkip && (
            <form action={skipToDemoPayPal} className={styles.demoSkip}>
              <p>
                <strong>Demo only.</strong> No sandbox login for Margaret&rsquo;s PayPal? Use the PayPal this demo already has saved for
                her instead. She still says yes on her tablet.
              </p>
              <PendingButton className={styles.secondary} pending="Connecting…">
                Skip Mom&rsquo;s PayPal login
              </PendingButton>
            </form>
          )}
        </InviteCard>
      );
    }
    if (invite.person === "Rosa") {
      return (
        <InviteCard
          key={invite.person}
          {...shared}
          message="Rosa, this opens Second Look on your phone, to check in when you visit Margaret."
          about={`She taps “I’m here” when she visits Mom. When the week is closed, PayPal pays her ${formatUsd(family.settings.visitRateCents)} a visit.`}
        />
      );
    }
    return (
      <InviteCard
        key={invite.person}
        {...shared}
        message={`${sibling}, this opens Second Look on your phone, for Mom’s payments.`}
        about={
          family.settings.ask === "everyone"
            ? `${he(sibling)} gets the same alerts as you about Mom’s payments, and whoever answers first decides. ${he(sibling)} also pays ${his(sibling)} share of Rosa’s care.`
            : `You chose to be the one asked about Mom’s payments, so ${he(sibling).toLowerCase()} sees them but isn’t asked. ${he(sibling)} pays ${his(sibling)} share of Rosa’s care.`
        }
      />
    );
  };

  return (
    <Frame role={organizer === "Tom" ? "tom" : "sarah"}>
      <LiveRefresh />
      <div className={styles.stage}>
        <Progress steps={steps} here="devices" organizer={organizer} />
        <div className={`${styles.panel} ${styles.wide}`}>
          <header className={styles.intro}>
            <h1 className={styles.heading}>{STEP_TITLE.devices}</h1>
            <p className={styles.lead}>
              Mom&rsquo;s family is set up. Now send each person their link, or have them scan their code: it opens Second Look as them, on
              their own device.
            </p>
            <p className={`${styles.help} ${styles.deskOnly}`}>
              On a computer, scan each code with that person&rsquo;s phone or tablet. To look around first, the names at the top open each
              screen right here.
            </p>
          </header>

          <div className={styles.invites}>{devices.invites.map(card)}</div>

          {vapidPublicKey() && (
            <section className={styles.alerts} aria-labelledby="alerts-heading">
              <h2 id="alerts-heading" className={styles.alertsHeading}>
                Alerts for you
              </h2>
              <p className={styles.help}>So your phone buzzes when one of Mom&rsquo;s payments waits for a second look.</p>
              <FamilyAlerts as={organizer === "Tom" ? "tom" : "sarah"} />
            </section>
          )}

          <form action={finishSetupStep} className={styles.actions}>
            <p className={styles.note}>Your family screen is next. These invites stay on its Rules tab.</p>
            <PendingButton className={styles.primary} pending="Opening your screen…">
              Done
            </PendingButton>
          </form>
        </div>
      </div>
    </Frame>
  );
}
