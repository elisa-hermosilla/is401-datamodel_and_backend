const DEVICE_TOKEN_MAX_LENGTH = 2600;

export function encodePushDeviceToken(subscription) {
  // The deployed ERD schema currently uses varchar(500). A compact, line-delimited form
  // stores the full browser endpoint and encryption keys without JSON labels.
  const value = `${subscription.endpoint}\n${subscription.keys.p256dh}\n${subscription.keys.auth}`;
  if (value.length > DEVICE_TOKEN_MAX_LENGTH) {
    const error = new Error("This browser's push subscription is longer than the database device_token field allows.");
    error.status = 400;
    throw error;
  }
  return value;
}

export function decodePushDeviceToken(value) {
  const stored = String(value || "");
  if (stored.startsWith("{")) return JSON.parse(stored);
  const [endpoint, p256dh, auth] = stored.split("\n");
  if (!endpoint || !p256dh || !auth) throw new Error("Stored browser push subscription is invalid");
  return { endpoint, keys: { p256dh, auth } };
}
