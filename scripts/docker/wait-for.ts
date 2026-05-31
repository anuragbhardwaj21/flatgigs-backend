import net from "net";

function waitFor(host: string, port: number, label: string): Promise<void> {
  return new Promise((resolve) => {
    const attempt = () => {
      const socket = net.createConnection({ host, port }, () => {
        socket.end();
        process.stdout.write(`Ready: ${label}\n`);
        resolve();
      });
      socket.on("error", () => {
        process.stdout.write(`Waiting for ${label} (${host}:${port})...\n`);
        setTimeout(attempt, 2000);
      });
    };
    attempt();
  });
}

async function main() {
  const pgHost = process.env.PGHOST ?? "postgres";
  const pgPort = parseInt(process.env.PGPORT ?? "5432", 10);
  const redisHost = process.env.REDIS_HOST ?? "redis";
  const redisPort = parseInt(process.env.REDIS_PORT ?? "6379", 10);
  const waitRedis = process.env.WAIT_REDIS !== "0";

  await waitFor(pgHost, pgPort, "postgres");
  if (waitRedis) {
    await waitFor(redisHost, redisPort, "redis");
  }
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
});
