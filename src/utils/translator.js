const translations = {
  "Osculetur me osculo oris sui; meliora sunt ubera tua vino.":
    "Let him kiss me with the kiss of his mouth; your love is better than wine.",
  "Et factum est in trigesimo anno, in quarto mense, quinta mensis.":
    "And it came to pass in the thirtieth year, in the fourth month, on the fifth day of the month.",
  "Quia ego scio cogitationes quas cogito super vos, dicit Dominus.":
    "For I know the thoughts that I think toward you, says the Lord.",
};

export function translate(text) {
  return translations[text] || "Translation not available.";
}
