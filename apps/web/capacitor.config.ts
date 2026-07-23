import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.kskawarrior.dicebet",
  appName: "DiceBet",
  // The same static Nuxt build that ships to Cloudflare
  webDir: ".output/public",
};

export default config;
