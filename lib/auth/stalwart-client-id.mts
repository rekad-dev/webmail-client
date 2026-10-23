const EXISTING_STALWART_CLIENT_ID = "webmail";

export function getStalwartClientId(
  configuredId: string | undefined = process.env.AUTH_STALWART_ID,
): string {
  const clientId = configuredId ?? EXISTING_STALWART_CLIENT_ID;
  if (clientId !== EXISTING_STALWART_CLIENT_ID) {
    throw new Error("AUTH_STALWART_ID must identify the existing webmail client.");
  }
  return clientId;
}
