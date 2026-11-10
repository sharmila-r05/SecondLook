import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// web-push and the database are both faked: nothing here reaches a push service or Postgres.
const sendNotification = vi.hoisted(() => vi.fn());
vi.mock("web-push", () => ({ default: { sendNotification } }));

const queries = vi.hoisted(() => ({ rows: [] as unknown[], sent: [] as { text: string; values: unknown[] }[] }));
vi.mock("@/lib/db", () => {
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    queries.sent.push({ text, values });
    return Promise.resolve(text.startsWith("select") ? queries.rows : []);
  };
  sql.json = (value: unknown) => value;
  return { db: () => sql };
});

import { decidedMessage, familyPath, holdMessage } from "@/lib/copy/push";
import { deliver, notifyChildren, parseSubscription, payloadFor, vapidPublicKey } from "@/lib/push";

const PAYMENT = { id: "6f1c2a9e-3b4d-4e5f-8a7b-9c0d1e2f3a4b", payeeName: "Tech Support Line", amountCents: 150000 };
const KEYS = { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" };
const FCM = "https://fcm.googleapis.com/fcm/send/abc123";
const VAPID = { VAPID_SUBJECT: "mailto:family@example.com", VAPID_PUBLIC_KEY: "public-key", VAPID_PRIVATE_KEY: "private-key" };

function pushError(statusCode: number) {
  return Object.assign(new Error("Received unexpected response code"), { name: "WebPushError", statusCode, endpoint: "secret" });
}

describe("the alert copy", () => {
  it("tells the children who Mom is paying, how much, what for in her words, and why it waits, with no score", () => {
    const message = holdMessage(
      {
        ...PAYMENT,
        said: "Pay $1,500 to tech support, they said my computer is hacked",
        rules: [{ chip: "New payee" }, { chip: "Over $300 limit" }, { chip: "Tech-support story" }],
      },
      10,
    );
    expect(message.title).toBe("Mom wants to pay $1,500.00 to Tech Support Line");
    expect(message.body).toBe(
      "She said: “Pay $1,500 to tech support, they said my computer is hacked”\nNew payee · Over $300 limit · Tech-support story",
    );
    expect(`${message.title} ${message.body}`).not.toMatch(/scam|fraud|risk|score|%|!/i);
    expect(message.urgency).toBe("high");
    expect(message.ttlSeconds).toBe(600);
  });

  it("keeps a long request short enough for a lock screen, and still says who and how much without her words", () => {
    const said = `Pay $1,500 to tech support ${"because the man on the phone said so ".repeat(8)}`;
    const long = holdMessage({ ...PAYMENT, said, rules: [{ chip: "New payee" }] }, 10);
    expect(long.body.length).toBeLessThan(150);
    expect(long.body).toMatch(/^She said: “Pay \$1,500 to tech support because .*…”\nNew payee$/);
    const bare = holdMessage(PAYMENT, 10);
    expect(bare.title).toBe("Mom wants to pay $1,500.00 to Tech Support Line");
    expect(bare.body).toBe("Tap to take a second look.");
  });

  it("says who answered, and replaces the waiting alert for the same payment", () => {
    const hold = holdMessage(PAYMENT, 10);
    const no = decidedMessage(PAYMENT, "Sarah", "deny");
    expect(no.title).toBe("Sarah took the second look");
    expect(no.body).toBe("Sarah said no to $1,500.00 to Tech Support Line. The money never left Mom’s account.");
    expect(decidedMessage(PAYMENT, "Tom", "approve").body).toBe("Tom approved $1,500.00 to Tech Support Line. It’s being paid now.");
    expect(no.tag).toBe(hold.tag);
    expect(no.topic).toBe(hold.topic);
  });

  it("uses a push topic the services accept: at most 32 URL-safe characters", () => {
    expect(holdMessage(PAYMENT, 10).topic).toMatch(/^[A-Za-z0-9_-]{1,32}$/);
  });

  it("opens each child's own view", () => {
    expect(familyPath("Sarah")).toBe("/family");
    expect(familyPath("Tom")).toBe("/family?as=tom");
    expect(JSON.parse(payloadFor(holdMessage(PAYMENT, 10), "Tom"))).toEqual({
      title: "Mom wants to pay $1,500.00 to Tech Support Line",
      body: "Tap to take a second look.",
      tag: `look-${PAYMENT.id}`,
      url: "/family?as=tom",
    });
  });
});

describe("parseSubscription", () => {
  it("accepts a browser's subscription at a known push service", () => {
    expect(parseSubscription({ endpoint: FCM, keys: KEYS, expirationTime: null })).toEqual({ endpoint: FCM, keys: KEYS });
    for (const endpoint of ["https://updates.push.services.mozilla.com/wpush/v2/x", "https://web.push.apple.com/QA", "https://wns2-par02p.notify.windows.com/w/?token=x"]) {
      expect(parseSubscription({ endpoint, keys: KEYS })).not.toBeNull();
    }
  });

  it("refuses anything the server shouldn't post to", () => {
    for (const endpoint of ["http://fcm.googleapis.com/fcm/send/x", "https://example.com/push", "https://fcm.googleapis.com.evil.test/x", "not a url"]) {
      expect(parseSubscription({ endpoint, keys: KEYS })).toBeNull();
    }
    expect(parseSubscription({ endpoint: `${FCM}${"x".repeat(2100)}`, keys: KEYS })).toBeNull();
  });

  it("refuses missing or malformed keys", () => {
    expect(parseSubscription(null)).toBeNull();
    expect(parseSubscription({ endpoint: FCM })).toBeNull();
    expect(parseSubscription({ endpoint: FCM, keys: { p256dh: KEYS.p256dh } })).toBeNull();
    expect(parseSubscription({ endpoint: FCM, keys: { ...KEYS, auth: "not base64!" } })).toBeNull();
  });
});

describe("vapidPublicKey", () => {
  it("is null unless all three VAPID settings are present, so the alerts control stays hidden", () => {
    expect(vapidPublicKey({})).toBeNull();
    expect(vapidPublicKey({ ...VAPID, VAPID_PRIVATE_KEY: "" })).toBeNull();
    expect(vapidPublicKey(VAPID)).toBe("public-key");
  });
});

describe("deliver", () => {
  beforeEach(() => sendNotification.mockReset());

  it("sends each phone its own payload with the message's TTL, urgency and topic", async () => {
    sendNotification.mockResolvedValue({ statusCode: 201, body: "", headers: {} });
    const vapid = { subject: "mailto:family@example.com", publicKey: "pub", privateKey: "priv" };
    const gone = await deliver(
      [
        { endpoint: FCM, keys: KEYS, memberName: "Sarah" },
        { endpoint: `${FCM}-tom`, keys: KEYS, memberName: "Tom" },
      ],
      holdMessage(PAYMENT, 10),
      vapid,
    );
    expect(gone).toEqual([]);
    expect(sendNotification).toHaveBeenCalledTimes(2);
    const [sub, payload, options] = sendNotification.mock.calls[1]!;
    expect(sub).toEqual({ endpoint: `${FCM}-tom`, keys: KEYS });
    expect(JSON.parse(payload).url).toBe("/family?as=tom");
    expect(options).toMatchObject({ vapidDetails: vapid, TTL: 600, urgency: "high", topic: PAYMENT.id.replace(/-/g, "") });
  });

  it("returns the subscriptions that are gone (404, 410) and keeps the rest", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    sendNotification
      .mockRejectedValueOnce(pushError(410))
      .mockRejectedValueOnce(pushError(404))
      .mockRejectedValueOnce(pushError(500))
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValueOnce({ statusCode: 201 });
    const recipients = ["a", "b", "c", "d", "e"].map((s) => ({ endpoint: `${FCM}/${s}`, keys: KEYS, memberName: "Sarah" }));
    const gone = await deliver(recipients, holdMessage(PAYMENT, 10), { subject: "mailto:x@example.com", publicKey: "p", privateKey: "q" });
    expect(gone).toEqual([`${FCM}/a`, `${FCM}/b`]);
    // Failures are logged by status only: never the endpoint or keys.
    const logged = error.mock.calls.flat().join(" ");
    expect(logged).toContain("500");
    expect(logged).not.toContain(FCM);
    expect(logged).not.toContain(KEYS.auth);
    error.mockRestore();
  });
});

describe("notifyChildren", () => {
  const before = { ...process.env };
  beforeEach(() => {
    sendNotification.mockReset();
    queries.sent.length = 0;
    queries.rows = [];
    Object.assign(process.env, VAPID);
  });
  afterEach(() => {
    process.env = { ...before };
  });

  it("does nothing at all without VAPID keys", async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    await notifyChildren({ id: "family-1" }, "session-1", holdMessage(PAYMENT, 10));
    expect(queries.sent).toEqual([]);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("reads only this session's children, leaves out whoever answered, and forgets gone phones", async () => {
    queries.rows = [
      { endpoint: `${FCM}/sarah`, keys: KEYS, name: "Sarah" },
      { endpoint: `${FCM}/tom`, keys: KEYS, name: "Tom" },
    ];
    sendNotification.mockResolvedValueOnce({ statusCode: 201 }).mockRejectedValueOnce(pushError(410));
    await notifyChildren({ id: "family-1" }, "session-1", decidedMessage(PAYMENT, "Sarah", "deny"), { except: "member-sarah" });

    const [select, ...rest] = queries.sent;
    expect(select?.text).toContain("ps.demo_session_id = ?");
    expect(select?.text).toContain("m.role = 'child'");
    expect(select?.values).toEqual(["session-1", "family-1", "member-sarah"]);
    expect(rest).toEqual([{ text: "delete from push_subscriptions where endpoint = ?", values: [`${FCM}/tom`] }]);
  });

  it("never throws into the money path", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    queries.rows = [{ endpoint: FCM, keys: KEYS, name: "Sarah" }];
    sendNotification.mockImplementation(() => {
      throw new Error("bad subscription");
    });
    await expect(notifyChildren({ id: "family-1" }, "session-1", holdMessage(PAYMENT, 10))).resolves.toBeUndefined();
    error.mockRestore();
  });
});
