import localFont from "next/font/local";

/**
 * Tipografías de la guía TDP (vendorizadas — el build no depende de Google Fonts):
 *  - Titulares: Barlow Condensed ExtraBold Italic
 *  - Body/UI:   Inter
 */
export const barlow = localFont({
  src: [
    { path: "../fonts/BarlowCondensed-700-italic-latin.woff2", weight: "700", style: "italic" },
    { path: "../fonts/BarlowCondensed-800-italic-latin.woff2", weight: "800", style: "italic" },
  ],
  variable: "--font-barlow",
  display: "swap",
});

export const inter = localFont({
  src: [
    { path: "../fonts/Inter-400-normal-latin.woff2", weight: "400", style: "normal" },
    { path: "../fonts/Inter-500-normal-latin.woff2", weight: "500", style: "normal" },
    { path: "../fonts/Inter-600-normal-latin.woff2", weight: "600", style: "normal" },
    { path: "../fonts/Inter-700-normal-latin.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-inter",
  display: "swap",
});
