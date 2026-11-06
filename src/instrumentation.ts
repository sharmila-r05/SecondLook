export async function register() {
  // The start-up check uses process.exit, which only exists in the Node.js runtime.
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./instrumentation-node");
}
