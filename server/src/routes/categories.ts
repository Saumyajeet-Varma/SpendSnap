import { Router } from "express";
import { authenticateToken } from "../middlewares/auth.js";
import { getCategories, getCategoryById, createCategory, updateCategory, deleteCategory } from "../controllers/categories.js";

const router = Router();

router.use(authenticateToken);

// GET /api/categories
router.get("/", getCategories);

// GET /api/categories/:id
router.get("/:id", getCategoryById);

// POST /api/categories
router.post("/", createCategory);

// PATCH /api/categories/:id
router.patch("/:id", updateCategory);

// DELETE /api/categories/:id
router.delete("/:id", deleteCategory);

export default router;
