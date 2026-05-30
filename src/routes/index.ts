import { Router } from "express";
import { citiesRouter } from "./cities.route";
import { searchRouter } from "./search.route";
import { listingsRouter } from "./listings.route";
import { chatRouter } from "./chat.route";
import { wishlistRouter } from "./wishlist.route";
import { reservationsRouter } from "./reservations.route";
import { compareRouter } from "./compare.route";
import { batchRouter } from "./batch.route";
import { agentsRouter } from "./agents.route";
import { topPicksRouter } from "./top-picks.route";

export const apiRouter = Router();

apiRouter.use(citiesRouter);
apiRouter.use(topPicksRouter);
apiRouter.use(searchRouter);
apiRouter.use(listingsRouter);
apiRouter.use(chatRouter);
apiRouter.use(wishlistRouter);
apiRouter.use(reservationsRouter);
apiRouter.use(compareRouter);
apiRouter.use(batchRouter);
apiRouter.use(agentsRouter);
