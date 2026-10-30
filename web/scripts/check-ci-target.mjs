// Workers Builds can override the Worker name without selecting its bindings.
// Enforce both the selected environment and the branch before adapter operations.
import { getDeploymentTarget } from "./check-resource-bindings.mjs";

export function getCliEnvironment(args = process.argv.slice(2), vars = process.env) {
  let selected;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--env" || argument === "-e") {
      selected = args[++index];
      if (selected === undefined || selected.startsWith("-")) throw new Error("Environment flag requires a value");
    }
    else if (argument.startsWith("--env=")) selected = argument.slice(6);
    else if (argument.startsWith("-e=")) selected = argument.slice(3);
  }
  return selected ?? vars.CLOUDFLARE_ENV;
}

export function checkCiTarget(environment, vars = process.env) {
  const { worker: target, branch } = getDeploymentTarget(environment);
  if (vars.WORKERS_CI !== "1" && !vars.WRANGLER_CI_OVERRIDE_NAME) return;
  if (vars.WRANGLER_CI_OVERRIDE_NAME && vars.WRANGLER_CI_OVERRIDE_NAME !== target) {
    throw new Error(`CI targets ${vars.WRANGLER_CI_OVERRIDE_NAME}, but the selected environment targets ${target}. Use the environment-specific build/deploy commands.`);
  }
  if (vars.WORKERS_CI_BRANCH && vars.WORKERS_CI_BRANCH !== branch) {
    throw new Error(`Refusing to operate on ${target} from branch ${vars.WORKERS_CI_BRANCH}; expected ${branch}. Correct the Workers Builds branch settings.`);
  }
}
