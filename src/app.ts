import express from "express";
import cors from "cors";
import morgan from "morgan";
import { config } from "./config";
import { apiResponseMiddleware } from "./middleware/api-response";
import { tokenMiddleware } from "./middleware/token";
import { requestIdMiddleware } from "./middleware/request-id";
import { errorHandler } from "./middleware/error-handler";
import { healthRouter } from "./routes/health.route";
import { apiRouter } from "./routes";

export function createApp() {
  const app = express();

  if (config.logHttp) {
    app.use(
      morgan("dev", {
        skip: (req) => req.path === "/health",
      })
    );
  }

  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use(apiResponseMiddleware);

  app.use(healthRouter);
  app.use(config.apiPrefix, tokenMiddleware, apiRouter);
  app.use(errorHandler);

  return app;
}
