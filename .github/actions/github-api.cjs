const repositoryApi = () =>
  `${process.env.GITHUB_API_URL || "https://api.github.com"}/repos/${process.env.GITHUB_REPOSITORY}`;

async function request(method, path, body) {
  const response = await fetch(`${repositoryApi()}${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`${method} ${path.split("?")[0]} returned ${response.status}`);
  return response.json();
}

const get = (path) => request("GET", path);

const post = (path, body) => request("POST", path, body);

function fail(title, message) {
  console.log(`::error title=${title}::${String(message).replace(/[\r\n%]+/g, " ")}`);
  process.exit(1);
}

const failWhenItThrows = (title, main) => main().catch((error) => fail(title, error?.message ?? error));

module.exports = { get, post, fail, failWhenItThrows };
