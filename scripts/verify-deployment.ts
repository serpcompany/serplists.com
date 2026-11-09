import { verifyDeployment } from "./verify-deployment-lib";

process.exitCode = await verifyDeployment(process.env);
