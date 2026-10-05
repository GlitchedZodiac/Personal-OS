import {
  type RenphoRecord,
  decryptBody,
  encryptBody,
} from "@/lib/renpho";

// RENPHO Health cloud — the network half. Three calls, the same ones their
// own app makes: log in, ask which measurement table the account lives in,
// page through the body-composition records.
//
// THE CONSTRAINT THAT SHAPES EVERYTHING HERE (found 2026-10-04): a login with
// his account signs his PHONE's Renpho Health app out, and a signed-out phone
// cannot carry a weigh-in from the scale to the cloud. A pull that logs in as
// him on a schedule would break the very thing it is reading. So this client
// can log in as a separate service account and read `targetUserId`'s records
// instead — and lib/renpho-sync.ts refuses to run at all until it is switched
// on deliberately.

const BASE_URL = "https://cloud.renpho.com";
const APP_VERSION = "6.6.0";
const PLATFORM = "android";
const PAGE_SIZE = 50;
const SUCCESS_CODES = new Set(["0", "101", "200", "20000"]);
// Device types the login asks to have listed — every body-weight scale.
const SCALE_TYPES = Array.from({ length: 20 }, (_, i) =>
  (i + 1).toString(16).toUpperCase().padStart(2, "0")
);
/** Body-composition records are sharded across sixteen tables. */
const SHARDS = Array.from(
  { length: 16 },
  (_, i) => `measurements_info_${i.toString(16).toUpperCase()}`
);

export interface RenphoCredentials {
  email: string;
  password: string;
  /** Read this user's records instead of the logged-in account's own. */
  targetUserId?: string;
}

export class RenphoError extends Error {
  constructor(
    readonly stage: "login" | "tables" | "records",
    message: string
  ) {
    super(`RENPHO ${stage}: ${message}`);
    this.name = "RenphoError";
  }
}

type Fetch = typeof fetch;
interface Session {
  token: string;
  userId: string;
}

async function post(
  fetchImpl: Fetch,
  stage: RenphoError["stage"],
  endpoint: string,
  payload: Buffer,
  session?: Session
): Promise<unknown> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (session) {
    headers.token = session.token;
    headers.userId = session.userId;
    headers.appVersion = APP_VERSION;
    headers.platform = PLATFORM;
  }

  let response: Response;
  try {
    response = await fetchImpl(`${BASE_URL}/${endpoint}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ encryptData: encryptBody(payload) }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw new RenphoError(stage, error instanceof Error ? error.message : "network error");
  }
  if (!response.ok) throw new RenphoError(stage, `HTTP ${response.status}`);

  const envelope = (await response.json()) as {
    code?: unknown;
    msg?: unknown;
    message?: unknown;
    data?: unknown;
  };
  if (!SUCCESS_CODES.has(String(envelope.code))) {
    const said = envelope.msg ?? envelope.message ?? "rejected";
    throw new RenphoError(stage, `code ${String(envelope.code)} — ${String(said)}`);
  }
  if (typeof envelope.data !== "string" || envelope.data === "") return null;
  try {
    return decryptBody(envelope.data);
  } catch {
    // A new app version changing the key or the envelope lands here.
    throw new RenphoError(stage, "response could not be decrypted");
  }
}

const json = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8");

function recordsOf(page: unknown): RenphoRecord[] {
  if (Array.isArray(page)) return page as RenphoRecord[];
  if (page && typeof page === "object") {
    for (const key of ["list", "data", "records", "measurements"]) {
      const inner = (page as Record<string, unknown>)[key];
      if (Array.isArray(inner)) return inner as RenphoRecord[];
    }
  }
  return [];
}

async function fetchPage(
  fetchImpl: Fetch,
  session: Session,
  tableName: string,
  userId: string,
  pageNum: number,
  pageSize = PAGE_SIZE
): Promise<RenphoRecord[]> {
  return recordsOf(
    await post(
      fetchImpl,
      "records",
      "RenphoHealth/scale/queryBodyCompositionMeasureData",
      json({ pageNum, pageSize, userIds: [userId], tableName }),
      session
    )
  );
}

/**
 * Pull measurement records, newest first.
 *
 * `maxPages` bounds the pull: the routine sync reads one page (the 50 newest —
 * months of weigh-ins), a backfill passes Infinity. The record count the
 * device endpoint reports is not consulted; it said 0 for an account holding
 * six records. Paging simply stops at the first short or empty page.
 */
export async function fetchRenphoRecords(
  credentials: RenphoCredentials,
  options: { maxPages?: number; fetchImpl?: Fetch } = {}
): Promise<RenphoRecord[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxPages = options.maxPages ?? 1;

  const login = (await post(
    fetchImpl,
    "login",
    "renpho-aggregation/user/login",
    json({
      questionnaire: {},
      login: {
        password: credentials.password,
        areaCode: "US",
        appRevision: APP_VERSION,
        cellphoneType: "Pitaya",
        systemType: "11",
        email: credentials.email,
        platform: PLATFORM,
      },
      bindingList: { deviceTypes: SCALE_TYPES },
    })
  )) as { login?: { token?: unknown; id?: unknown } } | null;

  const token = login?.login?.token;
  const ownId = login?.login?.id;
  if (typeof token !== "string" || !token || ownId == null) {
    throw new RenphoError("login", "no session token in the response");
  }
  const session: Session = { token, userId: String(ownId) };
  const userId = credentials.targetUserId ?? session.userId;

  // Which table holds this user's records. The device endpoint answers for
  // the logged-in account only; anyone else's table is found by probing.
  let tables: string[];
  if (userId === session.userId) {
    let info: unknown;
    try {
      info = await post(fetchImpl, "tables", "renpho-aggregation/device/count", Buffer.alloc(0), session);
    } catch {
      // Some app versions want an empty object rather than an empty body.
      info = await post(fetchImpl, "tables", "renpho-aggregation/device/count", json({}), session);
    }
    const scales = (info as { scale?: { tableName?: unknown }[] } | null)?.scale ?? [];
    tables = scales
      .map((scale) => scale.tableName)
      .filter((name): name is string => typeof name === "string" && name !== "");
  } else {
    tables = [];
    for (const shard of SHARDS) {
      const probe = await fetchPage(fetchImpl, session, shard, userId, 1, 1);
      if (probe.length > 0) tables.push(shard);
    }
  }
  if (tables.length === 0) {
    throw new RenphoError("tables", "no measurement table found for this user");
  }

  const records: RenphoRecord[] = [];
  for (const tableName of tables) {
    for (let page = 1; page <= maxPages; page++) {
      const batch = await fetchPage(fetchImpl, session, tableName, userId, page);
      records.push(...batch);
      if (batch.length < PAGE_SIZE) break;
    }
  }
  return records;
}
