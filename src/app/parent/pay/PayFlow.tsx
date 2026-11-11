"use client";

import { Mic, Square } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import { Stitch } from "@/components/quilt/Stitch";
import styles from "../ask.module.css";
import { confirmRequest, hearRequest, type ReadBack } from "./actions";
import pay from "./pay.module.css";

// The browser's speech recognition (Chrome, Edge, Safari). Typed minimally; Firefox has none, so typing is offered.
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

function speechRecognition(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

type Heard = Extract<ReadBack, { ok: true }>;

const noSubscription = () => () => {};

export function PayFlow() {
  const router = useRouter();
  // Browser capability, read without an effect: false while rendering on the server.
  const canSpeak = useSyncExternalStore(noSubscription, () => speechRecognition() !== null, () => false);
  const [listening, setListening] = useState(false);
  const [words, setWords] = useState("");
  const [typed, setTyped] = useState("");
  const [message, setMessage] = useState("");
  const [heard, setHeard] = useState<Heard | null>(null);
  const [pending, startTransition] = useTransition();
  const recognition = useRef<Recognition | null>(null);

  function readBack(text: string) {
    setMessage("");
    startTransition(async () => {
      const result = await hearRequest(text);
      if (result.ok) setHeard(result);
      else if (result.goTo) router.push(result.goTo);
      else setMessage(result.message);
    });
  }

  function listen() {
    const Ctor = speechRecognition();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    rec.onresult = (e) => {
      const parts = Array.from(e.results);
      setWords(parts.map((r) => r[0]?.transcript ?? "").join(" "));
      const last = parts[parts.length - 1];
      if (last?.isFinal) finalText = parts.map((r) => r[0]?.transcript ?? "").join(" ");
    };
    rec.onerror = (e) => {
      setMessage(
        e.error === "not-allowed"
          ? "The microphone isn’t allowed in this browser. You can type it below instead."
          : "I didn’t catch that. Tap the microphone and try again, or type it below.",
      );
    };
    rec.onend = () => {
      setListening(false);
      if (finalText) readBack(finalText);
    };
    recognition.current = rec;
    setWords("");
    setMessage("");
    setListening(true);
    rec.start();
  }

  if (heard) {
    return (
      <section className={styles.ask} aria-labelledby="ask-heading">
        <h1 id="ask-heading" className={styles.question}>
          Pay {heard.payeeName} {heard.amountLabel}?
        </h1>
        <p className={styles.note}>You said: &ldquo;{heard.said}&rdquo;</p>
        <div className={styles.answers}>
          <button
            type="button"
            className={`${styles.answer} ${styles.yes}`}
            disabled={pending}
            onClick={() => startTransition(() => confirmRequest(heard))}
          >
            <Stitch kind="light" />
            {pending ? "One moment…" : "Yes, pay it"}
          </button>
          <button type="button" className={`${styles.answer} ${styles.no}`} disabled={pending} onClick={() => setHeard(null)}>
            No, start again
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.ask} aria-labelledby="ask-heading">
      <h1 id="ask-heading" className={styles.question}>
        Who would you like to pay?
      </h1>
      <p className={styles.note}>Say who and how much, like &ldquo;Pay the electric bill, $84.&rdquo;</p>

      {canSpeak && (
        <button
          type="button"
          className={`${pay.mic} ${listening ? pay.listening : ""}`}
          onClick={() => (listening ? recognition.current?.stop() : listen())}
          disabled={pending}
        >
          <Stitch kind="light" />
          {listening ? <Square className={pay.micIcon} aria-hidden="true" /> : <Mic className={pay.micIcon} aria-hidden="true" />}
          <span>{listening ? "I’m listening… tap when done" : "Tap and speak"}</span>
        </button>
      )}

      <p className={pay.words} aria-live="polite">
        {words}
      </p>

      <form
        className={pay.typeForm}
        onSubmit={(e) => {
          e.preventDefault();
          readBack(typed);
        }}
      >
        <label htmlFor="typed" className={pay.label}>
          {canSpeak ? "Or type it" : "Type who and how much"}
        </label>
        <div className={pay.typeRow}>
          <input
            id="typed"
            className={pay.field}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
          />
          <button type="submit" className={pay.next} disabled={pending || !typed.trim()}>
            {pending ? "One moment…" : "Next"}
          </button>
        </div>
      </form>

      <p className={pay.message} role="status">
        {message}
      </p>

      <Link href="/parent" className={pay.back}>
        Back to today
      </Link>
    </section>
  );
}
