export function isEncryptedPdf(buffer: Buffer) {
  const sample = buffer.toString("latin1", 0, Math.min(buffer.length, 4096));
  return /\/Encrypt\b/.test(sample);
}

export function extractPdfText(buffer: Buffer) {
  const content = buffer.toString("latin1");
  const matches = content.match(/\(([^()]{2,200})\)/g) || [];
  const text = matches
    .map((chunk) => chunk.slice(1, -1))
    .filter((chunk) => /[A-Za-z0-9]/.test(chunk))
    .join(" ");

  return text.replace(/\s+/g, " ").trim();
}
