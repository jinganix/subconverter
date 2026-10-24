import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createProxy, ProxyType } from "@subconverter/core";

import {
  clearGeoIpCache,
  countryResolverFrom,
  getGeoIpDatabase,
  isHostIp,
  openGeoIpDatabase,
  resolveNodeCountries,
} from "../src/geoip";
import { buildGeoIpFixture } from "./mmdb-fixture";

let dir = "";
let dbPath = "";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "subconverter-geoip-"));
  dbPath = join(dir, "GeoLite2-Country.mmdb");
  await writeFile(dbPath, buildGeoIpFixture({ "1.2.3.4": "US", "5.6.7.8": "HK", "9.9.9.9": "JP" }));
});

afterEach(async () => {
  clearGeoIpCache();
  await rm(dir, { force: true, recursive: true });
});

function node(hostname: string, remark = "node"): ReturnType<typeof createProxy> {
  const proxy = createProxy();
  proxy.type = ProxyType.Trojan;
  proxy.hostname = hostname;
  proxy.port = 443;
  proxy.remark = remark;
  return proxy;
}

describe("isHostIp", () => {
  it("detects IP literals", () => {
    expect(isHostIp("1.2.3.4")).toBe(true);
    expect(isHostIp("[2001:db8::1]")).toBe(true);
    expect(isHostIp("2001:db8::1")).toBe(true);
    expect(isHostIp("example.com")).toBe(false);
    expect(isHostIp("999.1.1.1")).toBe(false);
    expect(isHostIp("")).toBe(false);
  });
});

describe("openGeoIpDatabase", () => {
  it("reads country codes and skips unknown addresses", async () => {
    const db = await openGeoIpDatabase(dbPath);
    expect(db.lookupCountry("1.2.3.4")).toBe("US");
    expect(db.lookupCountry("5.6.7.8")).toBe("HK");
    expect(db.lookupCountry("10.0.0.1")).toBeUndefined();
    expect(db.lookupCountry("not-an-ip")).toBeUndefined();
  });

  it("rejects a missing database file", async () => {
    await expect(openGeoIpDatabase(join(dir, "missing.mmdb"))).rejects.toThrow();
  });
});

describe("getGeoIpDatabase", () => {
  it("caches handles per path", async () => {
    const first = await getGeoIpDatabase(dbPath);
    const second = await getGeoIpDatabase(dbPath);
    expect(first).toBe(second);
  });

  it("does not cache failures", async () => {
    const missing = join(dir, "missing.mmdb");
    await expect(getGeoIpDatabase(missing)).rejects.toThrow();
    await expect(getGeoIpDatabase(missing)).rejects.toThrow();
  });
});

describe("resolveNodeCountries", () => {
  it("resolves literal IPs", async () => {
    const db = await openGeoIpDatabase(dbPath);
    const nodes = [node("1.2.3.4"), node("5.6.7.8"), node("10.0.0.1")];
    const codes = await resolveNodeCountries(nodes, db);
    expect([...codes.values()]).toEqual(["US", "HK"]);
  });

  it("resolves domains once and caches per hostname", async () => {
    const db = await openGeoIpDatabase(dbPath);
    const nodes = [node("a.example.com"), node("a.example.com"), node("b.example.com")];
    const calls: string[] = [];
    const codes = await resolveNodeCountries(nodes, db, {
      lookup: (host) => {
        calls.push(host);
        return Promise.resolve(host === "a.example.com" ? ["9.9.9.9"] : ["1.2.3.4"]);
      },
    });
    expect(calls).toEqual(["a.example.com", "b.example.com"]);
    expect(codes.get(nodes[0] as never)).toBe("JP");
    expect(codes.get(nodes[2] as never)).toBe("US");
  });

  it("skips unresolvable hosts and empty hostnames", async () => {
    const db = await openGeoIpDatabase(dbPath);
    let calls = 0;
    const nodes = [node(""), node("broken.example.com"), node("broken.example.com")];
    const codes = await resolveNodeCountries(nodes, db, {
      lookup: () => {
        calls += 1;
        return Promise.reject(new Error("ENOTFOUND"));
      },
    });
    expect(codes.size).toBe(0);
    expect(calls).toBe(1);
  });

  it("falls back to the next address when one has no match", async () => {
    const db = await openGeoIpDatabase(dbPath);
    const nodes = [node("multi.example.com")];
    const codes = await resolveNodeCountries(nodes, db, {
      lookup: () => Promise.resolve(["10.0.0.1", "5.6.7.8"]),
    });
    expect(codes.get(nodes[0] as never)).toBe("HK");
  });

  it("builds a synchronous resolver", async () => {
    const db = await openGeoIpDatabase(dbPath);
    const nodes = [node("1.2.3.4"), node("unknown.example")];
    const resolve = countryResolverFrom(await resolveNodeCountries(nodes, db));
    expect(resolve(nodes[0] as never)).toBe("US");
    expect(resolve(nodes[1] as never)).toBeUndefined();
  });
});
