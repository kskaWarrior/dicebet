import { Capacitor } from "@capacitor/core";

/**
 * Forwards webview JS errors to Firebase Crashlytics when running inside the
 * native Capacitor shell. No-op on the web build — the plugin is loaded
 * dynamically so it never runs in the browser.
 */
export function initCrashReporting() {
  if (!Capacitor.isNativePlatform()) return;

  import("@capacitor-firebase/crashlytics").then(({ FirebaseCrashlytics }) => {
    window.addEventListener("error", (e) => {
      FirebaseCrashlytics.recordException({
        message: `${e.message} @ ${e.filename}:${e.lineno}`,
      }).catch(() => {});
    });
    window.addEventListener("unhandledrejection", (e) => {
      FirebaseCrashlytics.recordException({
        message: `Unhandled rejection: ${String(e.reason)}`,
      }).catch(() => {});
    });
  });
}
