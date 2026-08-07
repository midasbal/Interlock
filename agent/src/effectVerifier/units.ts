export function ethStringToWei(ethAmount: string): bigint {
  const [whole, fraction = ""] = ethAmount.split(".");
  const fractionPadded = (fraction + "0".repeat(18)).slice(0, 18);
  return BigInt(whole || "0") * 10n ** 18n + BigInt(fractionPadded || "0");
}
