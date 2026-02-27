/**
 * Safe LIFF utility functions that won't crash when LIFF is not initialized
 * (e.g., when running outside of LINE or in development).
 */

const liff = window.liff;

export function isLiffLoggedIn() {
  try {
    return liff?.isLoggedIn?.() ?? false;
  } catch {
    return false;
  }
}

export function getLiffContext() {
  try {
    return liff?.getContext?.() ?? {};
  } catch {
    return {};
  }
}

export function getLiffAccessToken() {
  try {
    return liff?.getAccessToken?.() ?? null;
  } catch {
    return null;
  }
}

export function liffLogin() {
  try {
    liff?.login?.();
  } catch {
    console.warn("LIFF login not available");
  }
}

export function liffCloseWindow() {
  try {
    liff?.closeWindow?.();
  } catch {
    console.warn("LIFF closeWindow not available");
  }
}

export function isLiffInClient() {
  try {
    return liff?.isInClient?.() ?? false;
  } catch {
    return false;
  }
}

export async function liffShareTargetPicker(messages) {
  try {
    return await liff?.shareTargetPicker?.(messages);
  } catch {
    console.warn("LIFF shareTargetPicker not available");
    return null;
  }
}

export function getLiffId() {
  try {
    return liff?.id ?? null;
  } catch {
    return null;
  }
}
