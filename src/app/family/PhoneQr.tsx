import { headers } from "next/headers";
import QRCode from "qrcode";
import { joinCodeFor } from "@/lib/join";
import { publicOrigin } from "@/lib/redirect";
import styles from "./family.module.css";

export interface PhoneQrCode {
  svg: string;
  name: string;
}

/** A QR code that opens this screen on a phone, in the same demo family. The code inside expires after 15 minutes. */
export async function phoneQrCode(sessionId: string, as: "sarah" | "tom"): Promise<PhoneQrCode> {
  const code = await joinCodeFor(sessionId);
  const url = `${publicOrigin(await headers())}/join/${code}${as === "tom" ? "?as=tom" : ""}`;
  const svg = await QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#1a1720", light: "#ffffff" } });
  return { svg, name: as === "tom" ? "Tom" : "Sarah" };
}

/**
 * Desktop only, so the phone can get the alert when Margaret's payment is held. On a wide screen it stands beside the
 * phone column ("side"); on a narrower desktop it sits at the foot of the column ("column"). CSS shows one of the two.
 */
export function PhoneQr({ qr, placement }: { qr: PhoneQrCode; placement: "column" | "side" }) {
  const id = `phone-qr-${placement}`;
  return (
    <aside className={placement === "side" ? styles.phoneQrSide : styles.phoneQr} aria-labelledby={id}>
      <div className={styles.qr} role="img" aria-label={`QR code that opens ${qr.name}'s screen on a phone`} dangerouslySetInnerHTML={{ __html: qr.svg }} />
      <div>
        <h2 id={id} className={styles.qrTitle}>
          Open {qr.name}&rsquo;s screen on your phone
        </h2>
        <p className={styles.explain}>Scan with the phone&rsquo;s camera. It joins this same family, so its alerts and taps count here too.</p>
      </div>
    </aside>
  );
}
