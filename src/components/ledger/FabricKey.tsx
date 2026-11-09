import styles from "./FabricKey.module.css";

const PEOPLE = [
  { name: "Margaret", fabric: "margaret" },
  { name: "Sarah", fabric: "sarah" },
  { name: "Tom", fabric: "tom" },
  { name: "Rosa", fabric: "rosa" },
  { name: "Second Look", fabric: "plum" },
] as const;

/** Whose colour is whose: every block and every step wears the fabric of the person who set it going. */
export function FabricKey() {
  return (
    <div className={styles.key}>
      <p className={styles.caption}>Who set it going</p>
      <ul className={styles.list}>
        {PEOPLE.map((p) => (
          <li key={p.name} className={styles.item}>
            <span className={styles.swatch} data-fabric={p.fabric} aria-hidden="true" />
            {p.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
