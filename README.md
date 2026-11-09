# Second Look

**Mom pays her own bills. The family gets a second look when something's off.**

Second Look is a family money desk for an ageing parent, built on PayPal. Margaret keeps paying her own bills, in her
own words. When a payment looks like a scam, it isn't refused and it isn't paid: PayPal **holds** it while her daughter or
son takes a second look. Deny, and the hold is voided: the money never left Mom's account. Care costs are handled in the
same place: the home aide is paid through PayPal Payouts, and the siblings are each invoiced for their share.

**[Live demo](https://secondlook-02u1.onrender.com)** · Video: _link added at submission_ · PayPal **sandbox** only: no
real money moves, and every person in it is fictional.

![Margaret asks to pay $1,500 to "tech support". Her screen says it was sent to Sarah to double-check. Sarah's phone shows what's unusual about it, with Deny and Approve.](assets/readme/the-second-look.png)

## The problem

Older adults are the first target of payment scams. In 2025 people over 60 filed more than **201,000** complaints with
the FBI's Internet Crime Complaint Center and reported more than **$7.7 billion** in losses
([FBI, citing the IC3 2025 report](https://www.fbi.gov/news/stories/scammers-target-older-adult-victims)). The script
is familiar: a caller says the computer is hacked and "tech support" needs $1,500 today.

Families are left with two bad options:

- **Take over her money.** It protects the savings, but it takes away her independence and tells her she can no longer
  be trusted, often years before that's true.
- **Hope for the best.** Bank alerts arrive after the money is gone, and a card block is a blunt refusal that leaves her
  embarrassed and still on the phone with the scammer.

Meanwhile the ordinary costs of care fall to the family too: a home aide paid each week, and siblings settling up their
shares through reminders, IOUs and awkward texts.

## What Second Look does

**Margaret pays her own bills.** She taps *Pay a bill*, says or types "Pay the electric bill, $84", hears it read back,
and says yes. She connected her PayPal once, so that's all it takes. Normal bills go straight through.

**Anything unusual is held, not refused.** A new payee, an amount over her limit or three times the usual, words like
"gift cards" or "hacked", urgency, or too much in one day: the payment is placed as a **PayPal authorization** and sent
to Sarah and Tom.

- Their phones buzz. They see what's unusual, explained in a sentence or two, with the facts the rules found.
- **Approve** captures the money and pays the payee. **Deny** voids the authorization. If nobody answers, the hold is
  voided automatically when its time runs out. The first answer wins, exactly once.
- Margaret's screen never says "scam" or shows a risk score. It says *"Sent to Sarah to double-check"*, then *"Sarah said
  no, nothing was paid."*

**Care costs are paid and split.** Rosa, the aide, taps *I'm here* and *Visit done* (or Margaret says "Rosa came
today"). When Sarah or Tom closes the week, Rosa is paid her total through PayPal Payouts, and each sibling gets a PayPal
invoice for their share, split to the cent.

![After the second look: Margaret's screen says Sarah said no and nothing was paid. Sarah's Care tab shows Rosa's week closed, Rosa paid by PayPal and both shares invoiced, with a button to pay her share on PayPal. Rosa's screen shows her visits and pay.](assets/readme/after-the-look.png)

**Everyone sees the same ledger.** Every money move is a block in the colour of the person who set it going: Margaret's
bills in teal, Rosa's pay in sage, each sibling's share in their colour. A cancelled hold keeps its pulled stitches.
Select a block to see the PayPal steps behind it, with every ID.

![The shared ledger: this week's money moves as quilt blocks, with the cancelled $1,500 hold selected and its story and PayPal steps in a side panel.](assets/readme/ledger.png)

Under the quilt, **every PayPal step** Second Look made is listed with the ID PayPal returned and the `PayPal-Request-Id`
stored before the call.

![The Every PayPal step table: invoices to Sarah and Tom, the payout to Rosa, the voided hold and the original authorization, each with its PayPal ID, status and request ID.](assets/readme/paypal-steps.png)

## How the money moves

Second Look is a pass-through: Margaret's money reaches the payee only through PayPal, and only after a capture.

```mermaid
sequenceDiagram
  participant M as Margaret
  participant SL as Second Look
  participant PP as PayPal
  participant F as Sarah or Tom
  M->>SL: "Pay $1,500 to tech support, they said my computer is hacked"
  SL->>PP: Orders v2: AUTHORIZE order from her saved PayPal (vault_id)
  PP-->>SL: Authorization (the money is held, not taken)
  SL->>SL: Rules: new payee, over her limit, tech-support wording
  alt Nothing unusual
    SL->>PP: Payments v2: capture
    SL->>PP: Payouts: pay the payee
  else Held for a second look
    SL-->>F: Push alert, and Claude's note on why
    alt Approve and pay
      F->>SL: Approve
      SL->>PP: Capture, then Payouts to the payee
    else Deny, or nobody answers in time
      F->>SL: Deny
      SL->>PP: Payments v2: void the authorization
      Note over M,PP: The money never left Margaret's account
    end
  end
```

```mermaid
flowchart LR
  V["Rosa's visits<br/>(Rosa or Margaret logs them)"] --> C{"Sarah or Tom:<br/>Close the week"}
  C -->|"Payouts"| R["Rosa paid her total"]
  C -->|"Invoicing v2"| S["Invoice to Sarah<br/>for her share"]
  C -->|"Invoicing v2"| T["Invoice to Tom<br/>for his share"]
```

| PayPal API | What it does here |
|---|---|
| Vault v3 | Margaret connects her PayPal once; later bills need no PayPal page |
| Orders v2 | An `AUTHORIZE` order for each bill, paid from her saved PayPal |
| Payments v2 | Capture on approval; void on deny or when a hold runs out |
| Payouts | Paying the payee of a bill; paying Rosa for her week |
| Invoicing v2 | One invoice per sibling for their share of the care week |
| Webhooks | Verified notifications for captures, voids, payouts and paid invoices |

Orders, Payments and Vault use the official **PayPal Server SDK** for TypeScript (`@paypal/paypal-server-sdk`); Payouts,
Invoicing and webhook verification call the REST API directly.

## Where AI is used

- **Claude Sonnet 5.5** (`claude-sonnet-5-5`, Anthropic API) writes the note Sarah and Tom read on a held payment, from
  the facts the rules found. For the $1,500 call above it wrote: *"This is a first-time payee, well over her $300.00
  limit, and Mom said someone told her the computer was hacked. That fits a common tech-support scam, where callers
  claim a problem and ask for payment."*
- The **rules alone decide** what's held; the model only explains. The note is written after Margaret has her answer,
  so she never waits on it. A plain template note is used if the model is off, over its cap, slow, or returns anything
  unexpected. Calls are capped per demo session and per day.
- **Speech recognition** in the browser turns what Margaret says into text on her own device.

## Built to be safe

- **Hold, don't refuse.** A flagged payment is an open PayPal authorization: nothing is taken until a family member
  approves, and denying voids it.
- **No payout before a capture**, and no capture of a held payment without a family member's approval.
- **Nothing pays twice.** Every PayPal POST carries a `PayPal-Request-Id` stored before the call; payouts use a fixed
  `sender_batch_id` and invoices a fixed invoice number. Retries, double taps and webhook redeliveries are safe.
- **Integer cents** everywhere; shares always add up to the total, with the leftover cent going to a fixed person.
- **Secrets stay on the server**; the app refuses to start unless `PAYPAL_ENV=sandbox`.
- **Each visitor gets an isolated demo family**; Reset clears only theirs.
- **Margaret is never shamed**: no scam words or risk scores on her screen.

## Try it

Open the [live demo](https://secondlook-02u1.onrender.com) and switch people with the tabs at the top. Each visitor gets
their own demo family; **Reset** starts it over.

| Tab | Who | Try this |
|---|---|---|
| Margaret | The parent (`/parent`) | **Pay a bill** → "Pay the electric bill, $84" → paid. Then "Pay $1,500 to tech support, they said my computer is hacked" → held. |
| Sarah, Tom | Her children (`/family`) | The held payment and Claude's note. **Deny and cancel** or **Approve and pay**. On **Care**, close the week. On a desktop, scan the QR code to open Sarah's screen on your phone and get the alert there. |
| Rosa | The home aide (`/aide`) | **I'm here**, then **Visit done**; her week and her pay. |
| Ledger | Everyone (`/ledger`) | Every money move, week by week, and every PayPal step. |

Margaret's PayPal is already connected on the hosted demo, so bills need no PayPal login. Paying a sibling's invoice on
PayPal's page needs that sibling's sandbox login, which is in the submission's testing instructions.

## Sponsor tools

- **Render:** the web service and Postgres run on Render (`render.yaml` Blueprint), and closing the care week runs as a
  **Render Workflows** task (`workflows/close-week.ts`) with retries. Every step is idempotent, so a retry never pays
  twice. Without the workflow configured, the same steps run in the web app.
- **AG Grid:** the ledger's *Every PayPal step* table is AG Grid Community.
- **APIMatic:** the PayPal Server SDK is generated by APIMatic, and its PayPal context plugin was used while building.

## Run it locally

You need Node 24.22.1 (`.nvmrc`), PostgreSQL 16 or later, and a PayPal developer account.

1. **PayPal sandbox.** In the [developer dashboard](https://developer.paypal.com/dashboard/), create a REST app linked to
   a US sandbox business account, and tick Invoicing, Payouts and Save payment methods. Create US sandbox personal
   accounts for Margaret, Sarah, Tom and Rosa, and accounts for the payees. Put their addresses in
   `src/lib/demo/accounts.ts`.
2. **Environment.** `cp .env.example .env` and fill it in. `PAYPAL_ENV` must be `sandbox`. `LLM_API_KEY` is optional
   (without it the template note is used); so are the VAPID keys (web push) and the Render Workflows settings.
3. **Install and run:**

   ```sh
   nvm use
   npm ci
   createdb secondlook          # or point DATABASE_URL at any Postgres
   npm run db:migrate
   npm run dev                  # http://localhost:3000
   ```

4. **Checks:** `npm run check` runs the type check, lint and tests. The tests replay recorded PayPal and Anthropic
   answers from `test/fixtures/` and never call a live API.

Margaret connects her PayPal from her screen the first time (*Connect PayPal*, then log in as her sandbox account). To
start every new demo family already connected, put that saved PayPal's payment token in `DEMO_PARENT_VAULT_ID`.

Useful scripts: `scripts/sandbox/*.mjs` are small runs against the PayPal sandbox that record what PayPal answered, and
`node --env-file=.env scripts/dev/hold-for-test.mjs` gives the newest demo family a real held payment.

## Deploy on Render

`render.yaml` is a Blueprint for an always-on web service and a Postgres database: **New → Blueprint**, pick this
repository, and set the secret values it lists. Register the PayPal webhook with
`node --env-file=.env scripts/sandbox/create-webhook.mjs https://<your-service>.onrender.com` and set the printed ID as
`PAYPAL_WEBHOOK_ID`. For close-the-week on Render Workflows, create a workflow service from this repository with the
start command `node --experimental-transform-types --import ./workflows/register.mjs workflows/close-week.ts`, then set
`RENDER_WORKFLOW` (its slug) and `RENDER_WORKFLOW_API_KEY` on the web service.

## Project layout

```
src/app/            Margaret, family, aide and ledger screens; PayPal return, connect and webhook routes
src/lib/            bills (the money path), care (closing the week), risk rules, PayPal client, Vault, AI note, push, caps
src/components/     the quilt components shared by every screen, the ledger and push controls
db/migrations/      SQL migrations
workflows/          the Render Workflows task
scripts/            migrations, PayPal sandbox runs, dev helpers
test/               unit tests and recorded fixtures
assets/readme/      the images in this README
```

## License

[MIT](LICENSE)
