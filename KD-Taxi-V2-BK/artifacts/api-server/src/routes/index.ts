import { Router, type IRouter } from "express";
import healthRouter from "./health";
import taxiRouter from "./taxi";

const router: IRouter = Router();

router.use(healthRouter);
router.use(taxiRouter);

export default router;
