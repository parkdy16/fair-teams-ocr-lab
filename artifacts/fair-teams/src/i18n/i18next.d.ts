import "i18next";
import type { englishCatalog } from "./resources/en";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    returnNull: false;
    keySeparator: false;
    resources: {
      translation: typeof englishCatalog;
    };
  }
}
