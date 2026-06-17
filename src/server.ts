import http from "http";
import { config } from "./config";
import { createApp } from "./app";
import { attachWebSocketServer } from "./ws/server";
import { ensureRedis } from "./lib/redis";

async function main() {
  // await ensureRedis();
  const app = createApp();
  const server = http.createServer(app);
  attachWebSocketServer(server);

  server.listen(config.port, config.host, () => {
    process.stdout.write(
      `API http://${config.host}:${config.port}${config.apiPrefix} WS ${config.wsPath}\n`
    );
  });
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
});
