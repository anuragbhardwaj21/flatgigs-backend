import { Router } from "express";
import { getChatPayload } from "../services/conversation.service";

export const chatRouter = Router();

chatRouter.get("/chat", async (req, res) => {
  const token = req.token!;
  const payload = await getChatPayload(token);
  res.success(payload);
});
