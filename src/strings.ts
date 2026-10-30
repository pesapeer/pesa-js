// The languages the elements and the hosted pages speak, and the few words
// this script shows itself: the iframes' titles and the 3-D Secure fallback.

export type Locale = "en" | "fr" | "fr-CA" | "zh-Hans";

export interface Words {
  card: string;
  express: string;
  challenge: string;
  trouble: string;
}

const words: Record<Locale, Words> = {
  en: {
    card: "Card details",
    express: "Express payment",
    challenge: "Card authentication",
    trouble: "Having trouble? Continue on your bank's page",
  },
  fr: {
    card: "Informations de la carte",
    express: "Paiement express",
    challenge: "Authentification de la carte",
    trouble: "Un problème ? Continuez sur la page de votre banque",
  },
  "fr-CA": {
    card: "Informations de la carte",
    express: "Paiement express",
    challenge: "Authentification de la carte",
    trouble: "Un problème? Continuez sur la page de votre banque",
  },
  "zh-Hans": {
    card: "银行卡信息",
    express: "快捷支付",
    challenge: "银行卡验证",
    trouble: "遇到问题？前往银行页面继续",
  },
};

/** The words for a locale; English when none is given or it is not one of the four. */
export function wordsFor(locale?: string): Words {
  return (locale && words[locale as Locale]) || words.en;
}
