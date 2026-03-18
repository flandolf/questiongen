import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./components/theme-provider";

if (/Android/i.test(window.navigator.userAgent)) {
  document.documentElement.classList.add("platform-android");

  const setAndroidViewportHeight = () => {
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    document.documentElement.style.setProperty("--android-app-height", `${Math.round(viewportHeight)}px`);
  };

  setAndroidViewportHeight();
  window.visualViewport?.addEventListener("resize", setAndroidViewportHeight);
  window.addEventListener("resize", setAndroidViewportHeight);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="questiongen-theme">
      <App/>
    </ThemeProvider>
  </React.StrictMode>,
);
