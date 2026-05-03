export interface LanguageOption {
  code: string;
  name: string;
}

export const LANGUAGES: LanguageOption[] = [
  { code: "en", name: "English" },
  { code: "en-GB", name: "British English" },
  { code: "nl", name: "Dutch" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "pt-PT", name: "European Portuguese" },
  { code: "pt-BR", name: "Brazilian Portuguese" },
  { code: "es-ES", name: "European Spanish" },
  { code: "es-419", name: "Latin American Spanish" },
  { code: "pl", name: "Polish" },
  { code: "uk", name: "Ukrainian" },
  { code: "sv", name: "Swedish" },
  { code: "ru", name: "Russian" },
];

export const DEFAULT_SOURCE = "en";
export const DEFAULT_TARGET = "fr";
