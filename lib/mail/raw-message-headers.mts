export interface RawMessageHeader {
  name: string;
  value: string;
}

function decodeQuotedPrintableWord(value: string): Uint8Array {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "_") {
      bytes.push(0x20);
    } else if (character === "=" && /^[0-9a-f]{2}$/i.test(value.slice(index + 1, index + 3))) {
      bytes.push(Number.parseInt(value.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(character.charCodeAt(0) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

function decodeEncodedWord(charset: string, encoding: string, text: string): string | null {
  try {
    const bytes = encoding.toUpperCase() === "B"
      ? Uint8Array.from(atob(text), (character) => character.charCodeAt(0))
      : decodeQuotedPrintableWord(text);
    return new TextDecoder(charset.split("*")[0]).decode(bytes);
  } catch {
    return null;
  }
}

/** Decodes RFC 2047 encoded words; undecodable words are left as written. */
export function decodeHeaderValue(value: string): string {
  return value
    .replace(/(\?=)\s+(?==\?)/g, "$1")
    .replace(
      /=\?([^?\s]+)\?([BbQq])\?([^?\s]*)\?=/g,
      (word, charset: string, encoding: string, text: string) =>
        decodeEncodedWord(charset, encoding, text) ?? word,
    );
}

/** Splits the header block of a raw RFC 5322 message and unfolds continuation lines. */
export function parseRawMessageHeaders(raw: string): RawMessageHeader[] {
  const separator = raw.search(/\r?\n\r?\n/);
  const block = separator === -1 ? raw : raw.slice(0, separator);
  const headers: RawMessageHeader[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (/^[ \t]/.test(line)) {
      const last = headers[headers.length - 1];
      if (last) last.value = `${last.value} ${line.trim()}`;
      continue;
    }
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    headers.push({ name: line.slice(0, colon).trim(), value: line.slice(colon + 1).trim() });
  }
  return headers;
}

export function firstHeader(headers: RawMessageHeader[], name: string): string | null {
  const lowerName = name.toLowerCase();
  const header = headers.find((candidate) => candidate.name.toLowerCase() === lowerName);
  return header ? header.value : null;
}
