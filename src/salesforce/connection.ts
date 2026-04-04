import { Org, Connection } from "@salesforce/core";

const ORG_TOKENS = {
  ALLOW_ALL_ORGS: "ALLOW_ALL_ORGS",
  DEFAULT_TARGET_ORG: "DEFAULT_TARGET_ORG",
  DEFAULT_TARGET_DEV_HUB: "DEFAULT_TARGET_DEV_HUB",
} as const;

export async function getOrgConnection(
  allowedOrgs: string[],
  targetOrg?: string,
): Promise<{ org: Org; connection: Connection }> {
  if (allowedOrgs.length === 0) {
    throw new Error(
      "No orgs allowed. Pass --allowed-orgs flag when starting the server. " +
        "Example: --allowed-orgs DEFAULT_TARGET_ORG",
    );
  }

  const org = targetOrg ? await Org.create({ aliasOrUsername: targetOrg }) : await Org.create({});

  const username = org.getUsername();
  if (!username) {
    throw new Error("Could not determine org username. Ensure you are authenticated via SF CLI.");
  }

  validateOrgAccess(allowedOrgs, username, org);

  const connection = org.getConnection();
  return { org, connection };
}

function validateOrgAccess(allowedOrgs: string[], username: string, _org: Org): void {
  for (const allowed of allowedOrgs) {
    if (allowed === ORG_TOKENS.ALLOW_ALL_ORGS) return;
    if (allowed === ORG_TOKENS.DEFAULT_TARGET_ORG) return;
    if (allowed === ORG_TOKENS.DEFAULT_TARGET_DEV_HUB) return;
    if (allowed === username) return;

    // Username already checked above; aliases are resolved by Org.create()
  }

  throw new Error(
    `Org "${username}" is not in the allowed orgs list. ` +
      `Allowed: [${allowedOrgs.join(", ")}]. ` +
      `Pass --allowed-orgs ALLOW_ALL_ORGS to allow any authenticated org.`,
  );
}
