#!/usr/bin/env node
// Minimal App Store Connect API client — zero dependencies (node:crypto can
// emit the raw r||s ES256 signature JWTs need via dsaEncoding ieee-p1363).
// Companion to testflight-upload.sh; used for TestFlight groups/testers,
// bundle-id checks, and build status. Written 2026-08-28.
//
// Usage:
//   ASC_KEY_ID=… ASC_ISSUER_ID=… node ios/scripts/asc-api.mjs GET  /v1/apps
//   … node ios/scripts/asc-api.mjs POST /v1/betaGroups '{"data":{…}}'
//
// Reads the private key from ~/.appstoreconnect/private_keys/AuthKey_<id>.p8
// (override: ASC_KEY_PATH). Prints "<status>" then the response body.

import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";

const keyId = process.env.ASC_KEY_ID;
const issuer = process.env.ASC_ISSUER_ID;
if (!keyId || !issuer) {
  console.error("set ASC_KEY_ID and ASC_ISSUER_ID");
  process.exit(2);
}
const keyPath =
  process.env.ASC_KEY_PATH ||
  `${process.env.HOME}/.appstoreconnect/private_keys/AuthKey_${keyId}.p8`;

const b64u = (data) => Buffer.from(data).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const header = b64u(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
const payload = b64u(
  JSON.stringify({ iss: issuer, iat: now, exp: now + 600, aud: "appstoreconnect-v1" })
);
const key = createPrivateKey(readFileSync(keyPath));
const sig = sign("sha256", Buffer.from(`${header}.${payload}`), {
  key,
  dsaEncoding: "ieee-p1363",
});
const jwt = `${header}.${payload}.${b64u(sig)}`;

const [method = "GET", path = "/v1/apps", body] = process.argv.slice(2);
const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
  method,
  headers: {
    Authorization: `Bearer ${jwt}`,
    "Content-Type": "application/json",
  },
  body: body || undefined,
});
console.log(res.status);
console.log(await res.text());
if (!res.ok) process.exit(1);
