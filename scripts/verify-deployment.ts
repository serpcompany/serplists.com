import { pathToFileURL } from "node:url";

import { verifyDeployment } from "./verify-deployment-lib";

export { SIGN_IN_PATH, verifyDeployment } from "./verify-deployment-lib";

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = await verifyDeployment(process.env);
}
