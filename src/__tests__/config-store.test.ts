import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadAllProfiles, loadProfile, saveProfile } from "../index.js";

const originalHome = process.env.HOME;

async function setupTempHome(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "taurusdb-ts-test-"));
  process.env.HOME = dir;
  return dir;
}

afterEach(() => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  delete process.env.HW_AK;
});

describe("config store", () => {
  it("SaveAndLoad", async () => {
    await setupTempHome();
    await saveProfile(
      {
        ak: "test-ak",
        sk: "test-sk",
        region: "cn-north-4",
        project_id: "proj-123"
      },
      "test"
    );
    const loaded = await loadProfile("test");
    expect(loaded.ak).toBe("test-ak");
    expect(loaded.sk).toBe("test-sk");
    expect(loaded.region).toBe("cn-north-4");
    expect(loaded.project_id).toBe("proj-123");
  });

  it("LoadProfileNotFound", async () => {
    await setupTempHome();
    await saveProfile({ ak: "ak", sk: "sk", region: "cn-north-4", project_id: "p" }, "default");
    await expect(loadProfile("nonexistent")).rejects.toThrow(/Profile "nonexistent" 不存在/);
  });

  it("EnvVarOverride", async () => {
    await setupTempHome();
    await saveProfile({ ak: "file-ak", sk: "file-sk", region: "cn-north-4", project_id: "p" }, "default");
    process.env.HW_AK = "override-ak";
    const loaded = await loadProfile("default");
    expect(loaded.ak).toBe("override-ak");
  });

  it("FilePermissions", async () => {
    const tmpHome = await setupTempHome();
    await saveProfile({ ak: "ak", sk: "sk", region: "cn-north-4", project_id: "p" }, "default");
    const cfgFile = path.join(tmpHome, ".taurusdb", "config.yaml");
    const stat = await fs.stat(cfgFile);
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it("OverwriteExistingProfile", async () => {
    await setupTempHome();
    await saveProfile({ ak: "ak1", sk: "sk1", region: "cn-north-4", project_id: "p1" }, "default");
    await saveProfile({ ak: "ak2", sk: "sk2", region: "cn-south-1", project_id: "p2" }, "default");
    const loaded = await loadProfile("default");
    expect(loaded.ak).toBe("ak2");
    expect(loaded.region).toBe("cn-south-1");
  });

  it("MultipleProfiles", async () => {
    await setupTempHome();
    await saveProfile({ ak: "dev-ak" }, "dev");
    await saveProfile({ ak: "prod-ak" }, "prod");
    const all = await loadAllProfiles();
    expect(all.dev.ak).toBe("dev-ak");
    expect(all.prod.ak).toBe("prod-ak");
  });
});
