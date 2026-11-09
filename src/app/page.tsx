import { redirect } from "next/navigation";

/** The demo starts on Margaret's screen; the role tabs at the top switch people. */
export default function Home() {
  redirect("/parent");
}
