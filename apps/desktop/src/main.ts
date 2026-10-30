// SPDX-License-Identifier: MIT OR Apache-2.0

import { createApp } from "vue";
import App from "./App.vue";
import {
  createAppI18n,
  detectLocale,
  preferredLanguages,
  syncDocumentLanguage,
} from "./i18n";
import "./styles/main.css";

// The app starts in the user's language when it has translations for it
// (src/i18n.ts), and in English otherwise.
const i18n = createAppI18n(detectLocale(preferredLanguages(navigator)));

const app = createApp(App).use(i18n);
const stopLanguageSync = syncDocumentLanguage(
  i18n.global.locale,
  document.documentElement,
);
app.onUnmount(stopLanguageSync);
app.mount("#app");
