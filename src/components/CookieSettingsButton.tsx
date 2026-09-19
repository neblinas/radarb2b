"use client";

export default function CookieSettingsButton() {
  function openSettings() {
    window.dispatchEvent(new Event("radar-open-cookie-settings"));
  }

  return (
    <button
      type="button"
      onClick={openSettings}
      className="transition hover:text-cyan-300"
    >
      Gerir cookies
    </button>
  );
}
