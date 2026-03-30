export interface ServerConfig {
  allowedOrgs: string[];
  outputDir: string;
}

export function parseCliArgs(args: string[]): ServerConfig {
  const allowedOrgsIndex = args.indexOf("--allowed-orgs");
  const allowedOrgs =
    allowedOrgsIndex !== -1 && args[allowedOrgsIndex + 1]
      ? args[allowedOrgsIndex + 1].split(",").map((s) => s.trim())
      : [];

  const outputDirIndex = args.indexOf("--output-dir");
  const outputDir =
    outputDirIndex !== -1 && args[outputDirIndex + 1] ? args[outputDirIndex + 1] : "./sf-logs/";

  return { allowedOrgs, outputDir };
}
