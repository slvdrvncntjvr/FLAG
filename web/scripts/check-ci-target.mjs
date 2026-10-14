// Workers Builds can override the Worker name without selecting its bindings.
// Enforce both the selected environment and the branch before adapter operations.
export function getCliEnvironment(args = process.argv.slice(2), vars = process.env) {
  let selected;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--env" || argument === "-e") selected = args[++index];
    else if (argument.startsWith("--env=")) selected = argument.slice(6);
    else if (argument.startsWith("-e=")) selected = argument.slice(3);
  }
  return selected ?? vars.CLOUDFLARE_ENV;
}

export function checkCiTarget(environment, vars = process.env) {
  if (vars.WORKERS_CI !== "1" && !vars.WRANGLER_CI_OVERRIDE_NAME) return;
  if (environment !== undefined && environment !== "" && environment !== "dev") {
    throw new Error("Unsupported Workers Builds environment");
  }
  const target = environment === "dev" ? "flag-dev" : "flag";
  const branch = environment === "dev" ? "dev" : "main";
  if (vars.WRANGLER_CI_OVERRIDE_NAME && vars.WRANGLER_CI_OVERRIDE_NAME !== target) {
    throw new Error(`CI targets ${vars.WRANGLER_CI_OVERRIDE_NAME}, but the selected environment targets ${target}. Use the environment-specific build/deploy commands.`);
  }
  if (vars.WORKERS_CI_BRANCH && vars.WORKERS_CI_BRANCH !== branch) {
    throw new Error(`Refusing to operate on ${target} from branch ${vars.WORKERS_CI_BRANCH}; expected ${branch}. Correct the Workers Builds branch settings.`);
  }
}
