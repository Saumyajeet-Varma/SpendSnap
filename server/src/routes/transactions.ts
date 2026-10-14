import { Router } from "express";
import { authenticateToken } from "../middlewares/auth.js";
import { getTransactions, createTransaction } from "../controllers/transactions.js";

const router = Router();

router.use(authenticateToken);

// GET /api/transactions
router.get("/", getTransactions);

// POST /api/transactions
router.post("/", createTransaction);

export default router;
