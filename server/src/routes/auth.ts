import { Router } from "express";
import { signup, login, getProfile, logout } from "../controllers/auth.js";
import { authenticateToken } from "../middlewares/auth.js";

const router = Router();

// POST /api/auth/signup
router.post("/signup", signup);

// POST /api/auth/login
router.post("/login", login);

// GET /api/auth/profile
router.get("/profile", authenticateToken, getProfile);

// POST /api/auth/logout
router.post("/logout", authenticateToken, logout);

export default router;
