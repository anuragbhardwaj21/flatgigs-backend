import { Router } from "express";
import { getChatSession } from "../services/chat.service";

export const chatRouter = Router();

chatRouter.get("/chat", async (req, res) => {
  const token = req.token!;
  const session = await getChatSession(token);
  res.success({
    conversationId: session.state?.conversationId ?? null,
    state: session.state,
    messages: session.messages,
  });
});
