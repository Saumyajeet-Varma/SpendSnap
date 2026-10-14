import { Router } from "express";
import { authenticateToken } from "../middlewares/auth.js";
import { getAccounts, getAccountById, createAccount, updateAccount, deleteAccount } from "../controllers/accounts.js";

const router = Router();

router.use(authenticateToken);

// GET /api/accounts
router.get("/", getAccounts);

// GET /api/accounts/:id
router.get("/:id", getAccountById);

// POST /api/accounts
router.post("/", createAccount);

// PATCH /api/accounts/:id
router.patch("/:id", updateAccount);

// DELETE /api/accounts/:id
router.delete("/:id", deleteAccount);

export default router;
