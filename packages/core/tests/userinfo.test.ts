import { describe, expect, it } from "vitest";

import {
  convertUserinfo,
  formatSubscriptionUserinfo,
  inferUserinfoProviderFromUrl,
  nextMonthlyResetTimestamp,
  normalizeUserinfoProvider,
  parseJmsUserinfo,
  parseRequestSettings,
  parseSubscriptionUserinfo,
} from "../src/index";

describe("normalizeUserinfoProvider", () => {
  it("maps aliases", () => {
    expect(normalizeUserinfoProvider("jms")).toBe("jms");
    expect(normalizeUserinfoProvider("JustMySocks")).toBe("jms");
    expect(normalizeUserinfoProvider("just-my-socks")).toBe("jms");
    expect(normalizeUserinfoProvider("raw")).toBe("subscription");
    expect(normalizeUserinfoProvider("")).toBe("auto");
    expect(normalizeUserinfoProvider(undefined)).toBe("auto");
    expect(normalizeUserinfoProvider("bogus")).toBe("auto");
  });
});

describe("parseJmsUserinfo", () => {
  it("converts a Just-My-Socks payload", () => {
    const raw = JSON.stringify({
      bw_counter_b: 13958222812,
      bw_reset_day_of_month: 11,
      monthly_bw_limit_b: 500000000000,
    });
    // 2026-10-17T00:00:00Z is after the 11th, so the reset rolls to Nov 11.
    const nowSec = Math.trunc(Date.UTC(2026, 9, 17) / 1000);
    const parsed = parseJmsUserinfo(raw, nowSec);
    expect(parsed).toEqual({
      download: 14987527622,
      expire: Math.trunc(Date.UTC(2026, 10, 11) / 1000),
      total: 536870912000,
      upload: 0,
    });
  });

  it("uses the current month when today precedes the reset day", () => {
    const raw = JSON.stringify({
      bw_counter_b: 1,
      bw_reset_day_of_month: 11,
      monthly_bw_limit_b: 10,
    });
    const nowSec = Math.trunc(Date.UTC(2026, 9, 5) / 1000);
    expect(parseJmsUserinfo(raw, nowSec)?.expire).toBe(Math.trunc(Date.UTC(2026, 9, 11) / 1000));
  });

  it("rejects non-JSON and empty payloads", () => {
    expect(parseJmsUserinfo("not json")).toBeUndefined();
    expect(parseJmsUserinfo(JSON.stringify({ foo: 1 }))).toBeUndefined();
  });

  it("scales decimal bytes to binary bytes (1000^3 -> 1024^3)", () => {
    const parsed = parseJmsUserinfo(
      JSON.stringify({
        bw_counter_b: 13958222812,
        bw_reset_day_of_month: 11,
        monthly_bw_limit_b: 500000000000,
      }),
    );
    // 500 GB decimal -> 536870912000 bytes so 1024-based clients show 500G.
    expect(parsed?.total).toBe(536870912000);
    expect(parsed?.download).toBe(14987527622);
  });
});

describe("inferUserinfoProviderFromUrl", () => {
  it("detects JMS quota endpoints", () => {
    expect(
      inferUserinfoProviderFromUrl("https://justmysocks6.net/members/getbwcounter.php?service=1"),
    ).toBe("jms");
    expect(inferUserinfoProviderFromUrl("https://jmssub.net/members/getsub.php?service=1")).toBe(
      "jms",
    );
    expect(inferUserinfoProviderFromUrl("https://example.com/quota")).toBeUndefined();
  });

  it("detects hyphenated JMS hostnames", () => {
    expect(inferUserinfoProviderFromUrl("https://just-my-socks.example.com/quota")).toBe("jms");
    expect(inferUserinfoProviderFromUrl("https://just_my_socks.example.com/quota")).toBe("jms");
  });
});

describe("nextMonthlyResetTimestamp", () => {
  it("rejects invalid reset days", () => {
    expect(nextMonthlyResetTimestamp(0)).toBe(0);
    expect(nextMonthlyResetTimestamp(32)).toBe(0);
  });
});

describe("subscription-userinfo headers", () => {
  it("round-trips through format/parse", () => {
    const header = formatSubscriptionUserinfo({
      download: 4460105213,
      expire: 1710442799,
      total: 2147483648,
      upload: 0,
    });
    expect(header).toBe("upload=0; download=4460105213; total=2147483648; expire=1710442799");
    expect(parseSubscriptionUserinfo(header)).toEqual({
      download: 4460105213,
      expire: 1710442799,
      total: 2147483648,
      upload: 0,
    });
  });

  it("rejects garbage", () => {
    expect(parseSubscriptionUserinfo("")).toBeUndefined();
    expect(parseSubscriptionUserinfo("hello")).toBeUndefined();
  });
});

describe("convertUserinfo", () => {
  it("converts JMS JSON with the jms provider", () => {
    const header = convertUserinfo(
      JSON.stringify({
        bw_counter_b: 13958222812,
        bw_reset_day_of_month: 11,
        monthly_bw_limit_b: 500000000000,
      }),
      "jms",
      Math.trunc(Date.UTC(2026, 9, 17) / 1000),
    );
    expect(header).toBe(
      `upload=0; download=14987527622; total=536870912000; expire=${Math.trunc(Date.UTC(2026, 10, 11) / 1000)}`,
    );
  });

  it("normalizes header strings with the subscription provider", () => {
    expect(convertUserinfo("upload=0; download=1; total=2; expire=3", "subscription")).toBe(
      "upload=0; download=1; total=2; expire=3",
    );
  });

  it("auto-detects JSON and header payloads", () => {
    expect(convertUserinfo(JSON.stringify({ download: 5, total: 10, upload: 1 }))).toBe(
      "upload=1; download=5; total=10; expire=0",
    );
    expect(convertUserinfo("upload=0; download=1; total=2; expire=3")).toBe(
      "upload=0; download=1; total=2; expire=3",
    );
    expect(convertUserinfo("")).toBeUndefined();
    expect(convertUserinfo("bogus")).toBeUndefined();
  });

  it("auto preserves expire for zero-usage JMS payloads", () => {
    const nowSec = Math.trunc(Date.UTC(2026, 9, 17) / 1000);
    const raw = JSON.stringify({
      bw_counter_b: 0,
      bw_reset_day_of_month: 11,
      monthly_bw_limit_b: 500000000000,
    });
    expect(convertUserinfo(raw, "auto", nowSec)).toBe(
      `upload=0; download=0; total=536870912000; expire=${Math.trunc(Date.UTC(2026, 10, 11) / 1000)}`,
    );
  });
});

describe("parseRequestSettings userinfo params", () => {
  it("parses underscore and hyphen aliases", () => {
    const underscore = parseRequestSettings(
      "target=clash&url=https%3A%2F%2Fx&userinfo_url=https%3A%2F%2Fq&userinfo_provider=jms",
    );
    expect(underscore.userinfoUrl).toBe("https://q");
    expect(underscore.userinfoProvider).toBe("jms");
    const hyphen = parseRequestSettings(
      "target=clash&userinfo-url=https%3A%2F%2Fq&userinfo-provider=jms",
    );
    expect(hyphen.userinfoUrl).toBe("https://q");
    expect(hyphen.userinfoProvider).toBe("jms");
  });

  it("defaults boolean flags to false when absent", () => {
    const settings = parseRequestSettings("target=clash&url=https%3A%2F%2Fx");
    expect(settings.list).toBe(false);
    expect(settings.nodeList).toBe(false);
    expect(settings.addEmoji).toBe(false);
    expect(settings.removeEmoji).toBe(false);
    expect(settings.appendType).toBe(false);
    expect(settings.filterDeprecated).toBe(false);
    expect(settings.newFieldName).toBe(true);
    expect(settings.classicalRuleset).toBe(false);
  });

  it("opts into legacy field names via legacy=true or new_name=false", () => {
    expect(parseRequestSettings("target=clash&legacy=true").newFieldName).toBe(false);
    expect(parseRequestSettings("target=clash&new_name=false").newFieldName).toBe(false);
    expect(parseRequestSettings("target=clash&new_field_name=false").newFieldName).toBe(false);
    expect(parseRequestSettings("target=clash&new_name=true").newFieldName).toBe(true);
  });

  it("treats a bare flag as true", () => {
    const settings = parseRequestSettings("target=clash&url=https%3A%2F%2Fx&list");
    expect(settings.list).toBe(true);
    expect(settings.nodeList).toBe(true);
  });
});
