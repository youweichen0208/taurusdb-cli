import { loadProfile } from "../config/profile.js";
import { LLMClient } from "../llm/client.js";
import { c } from "./banner.js";

export async function runAsk(profile: string, userText: string): Promise<void> {
  const cfg = await loadProfile(profile);
  if (!cfg.llm?.base_url || !cfg.llm?.model) {
    console.log(c().yellow("  ⚠ 未配置 LLM。请先运行: taurusdb llm configure"));
    return;
  }
  const client = new LLMClient(cfg.llm);
  const allowed = [
    "configure",
    "connect",
    "instance list [--full-id] [-o table|json|yaml]",
    "instance show <instance-id> [--metrics=false] [-o table|json|yaml]",
    "flavor list [--az-mode auto|single|multi]",
    "llm configure",
  ];
  const sug = await client.suggestCommand(userText, allowed);
  if (!sug.command) {
    console.log(c().yellow("  ⚠ 无法生成可靠命令。"));
    if (sug.explain) console.log(`  ${c().gray("说明:")} ${sug.explain}`);
    return;
  }
  console.log(`  ${c().gray("建议命令:")} ${c().cyan(sug.command)}`);
  if (sug.explain)
    console.log(`  ${c().gray("说明:")} ${c().gray(sug.explain)}`);
  if (sug.confidence)
    console.log(`  ${c().gray("置信度:")} ${sug.confidence.toFixed(2)}`);
}