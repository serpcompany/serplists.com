import { type Ran, run } from "./tools";

const actionlintVersion = "1.7.12";
const actionlintDigest = "sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667";
export const actionlintImage = `rhysd/actionlint:${actionlintVersion}@${actionlintDigest}`;

const DOCKER_COULD_NOT_RUN_THE_CONTAINER = 125;
const DOCKER_IS_NOT_RUNNING = /Cannot connect to the Docker daemon|error during connect|failed to connect to the docker API/i;

export type Runner = (command: string, args: readonly string[]) => Ran;

export interface LinterResult {
  status: "passed" | "failed" | "not available";
  ranIn: "docker" | "installed" | null;
  output: string;
}

const workflowFiles = (files: readonly string[]) => files.filter((file) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(file));

const dockerRan = (ran: Ran) =>
  !ran.missing && ran.status !== DOCKER_COULD_NOT_RUN_THE_CONTAINER && !DOCKER_IS_NOT_RUNNING.test(ran.output);

export function runActionlint(at: string, files: readonly string[], runner: Runner = (command, args) => run(command, args, { cwd: at })): LinterResult | undefined {
  const workflows = workflowFiles(files);
  if (workflows.length === 0) return undefined;
  const mount = `type=bind,source=${at},target=/repository,readonly`;
  const offline = ["--network", "none"];
  const inDocker = runner("docker", ["run", "--rm", ...offline, "--mount", mount, "--workdir", "/repository", actionlintImage, ...workflows]);
  if (dockerRan(inDocker)) return { status: inDocker.status === 0 ? "passed" : "failed", ranIn: "docker", output: inDocker.output };
  const installed = runner("actionlint", workflows);
  if (installed.missing) return { status: "not available", ranIn: null, output: "" };
  return { status: installed.status === 0 ? "passed" : "failed", ranIn: "installed", output: installed.output };
}

export function linterReport(result: LinterResult | undefined, inCi: boolean): { passed: boolean; findings: string[] } {
  if (result === undefined || result.status === "passed") return { passed: true, findings: [] };
  if (result.status === "not available") {
    const where = inCi ? "and CI must run it" : "so it ran nowhere on this machine; CI runs it";
    return { passed: !inCi, findings: [`actionlint didn't run: Docker couldn't run ${actionlintImage}, and actionlint isn't installed, ${where}.`] };
  }
  const ranIn = result.ranIn === "docker" ? `${actionlintImage} in Docker` : "the installed actionlint";
  return { passed: false, findings: [`actionlint (${ranIn}):`, result.output] };
}
