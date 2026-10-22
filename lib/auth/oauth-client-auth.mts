export function encodeOAuthClientBasicCredentials(
  clientId: string,
  clientSecret: string,
): string {
  const formEncode = (value: string) =>
    new URLSearchParams({ value }).toString().slice("value=".length);

  return Buffer.from(
    `${formEncode(clientId)}:${formEncode(clientSecret)}`,
    "utf8",
  ).toString("base64");
}
