import type { Server } from "http";
import { WebSocketServer } from "ws";
import { config } from "../config";
import { ok } from "../lib/api-response";
import { sendWs } from "./ws-response";
import { handleWsMessage } from "./chat.handler";
import { validate as uuidValidate } from "uuid";
import { replayHistoryIfAny } from "../services/conversation.service";

export function attachWebSocketServer(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: config.wsPath });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url ?? "", `http://${req.headers.host}`);
    const token = url.searchParams.get("token") ?? req.headers["x-token"];
    const tokenStr = Array.isArray(token) ? token[0] : token;

    sendWs(ws, "connected", ok({ message: "connected" }));

    if (tokenStr && uuidValidate(tokenStr)) {
      replayHistoryIfAny(ws, tokenStr).catch((err) => {
        sendWs(ws, "error", {
          data: null,
          success: false,
          meta: { code: 500, message: err instanceof Error ? err.message : "History replay failed" },
        });
      });
    }

    ws.on("message", (data) => {
      const raw = data.toString();
      handleWsMessage(ws, raw, tokenStr && uuidValidate(tokenStr) ? tokenStr : undefined).catch(
        (err) => {
          sendWs(ws, "error", {
            data: null,
            success: false,
            meta: { code: 500, message: err instanceof Error ? err.message : "WS error" },
          });
        }
      );
    });
  });

  return wss;
}
