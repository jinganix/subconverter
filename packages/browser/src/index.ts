import { type Proxy, parseSubscription } from "@subconverter/core";

export {
  type ExtraSettings,
  type Proxy,
  type ProxyGroupConfig,
  type RequestSettings,
  type TargetFormat,
  createExtraSettings,
  parseSubscription,
  toClash,
  toSurge,
} from "@subconverter/core";

/** Fetch a remote subscription body in the browser. */
export async function fetchSubscription(url: string, init?: RequestInit): Promise<string> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

/** Fetch and parse a subscription URL into nodes. */
export async function loadNodes(url: string, init?: RequestInit): Promise<Proxy[]> {
  return parseSubscription(await fetchSubscription(url, init));
}
