import { headers } from "next/headers";
import QRCode from "qrcode";
import { joinCodeFor } from "@/lib/join";
import { publicOrigin } from "@/lib/redirect";
import styles from "./family.module.css";

/**
 * Desktop only: a QR code that opens this screen on a phone, in the same demo family, so the phone can get the
 * alert when Margaret's payment is held. The code inside expires after 15 minutes.
 */
export async function PhoneQr({ sessionId, as }: { sessionId: string; as: "sarah" | "tom" }) {
  const code = await joinCodeFor(sessionId);
  const url = `${publicOrigin(await headers())}/join/${code}${as === "tom" ? "?as=tom" : ""}`;
  const svg = await QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#1a1720", light: "#ffffff" } });
  const name = as === "tom" ? "Tom" : "Sarah";
  return (
    <aside className={styles.phoneQr} aria-labelledby="phone-qr">
      <div className={styles.qr} role="img" aria-label={`QR code that opens ${name}'s screen on a phone`} dangerouslySetInnerHTML={{ __html: svg }} />
      <div>
        <h2 id="phone-qr" className={styles.qrTitle}>
          Open {name}&rsquo;s screen on your phone
        </h2>
        <p className={styles.explain}>Scan with the phone&rsquo;s camera. It joins this same family, so its alerts and taps count here too.</p>
      </div>
    </aside>
  );
}
