// The PayPal sandbox accounts behind the demo family. Every person and business is fictional (hard rule 8), and these
// are sandbox-only addresses: PayPal never sends mail outside the sandbox. They are shared by every visitor; only the
// database rows are per session.

export const SANDBOX_EMAILS = {
  secondLook: "secondlook-39d4c8@business.example.com",
  margaret: "margaret-39d4c8@personal.example.com",
  sarah: "sarah-39d4c8@personal.example.com",
  tom: "tom-39d4c8@personal.example.com",
  rosa: "rosa-39d4c8@personal.example.com",
  electric: "electric-39d4c8@business.example.com",
  pharmacy: "pharmacy-39d4c8@business.example.com",
  techSupport: "techsupport-39d4c8@personal.example.com",
} as const;
