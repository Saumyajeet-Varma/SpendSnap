import { Router } from "express";
import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

const router = Router();

const isValidColor = (color: unknown): color is string => 
    typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color);

// GET /api/categories?userId=...
router.get("/", async (req: Request, res: Response) => {
    try {
        const userId = typeof req.query.userId === "string" ? req.query.userId : "";

        if (!userId) {
            res.status(400).json({
                success: false,
                message: "userId is required",
            });

            return;
        }

        const categories = await prisma.category.findMany({
            where: { userId },
            include: {
                _count: {
                    select: { transactions: true },
                },
            },
            orderBy: { name: "asc" },
        });

        res.status(200).json({
            success: true,
            data: categories,
        });
    }
    catch (err) {
        console.error("Failed to fetch categories:", err);
        res.status(500).json({
            success: false,
            message: "Failed to fetch categories",
        });
    }
});

// GET /api/categories/:id?userId=...
router.get("/:id", async (req: Request, res: Response) => {
    try {
        const categoryId = req.params.id;
        const userId = typeof req.query.userId === "string" ? req.query.userId : "";

        if (typeof categoryId !== "string") {
            res.status(400).json({
                success: false,
                message: "Invalid categoryId",
            });

            return;
        }

        if (!userId) {
            res.status(400).json({
                success: false,
                message: "userId is required",
            });

            return;
        }

        const category = await prisma.category.findFirst({
            where: { id: categoryId, userId },
            include: {
                _count: {
                    select: { transactions: true },
                },
            },
        });

        if (!category) {
            res.status(404).json({
                success: "false",
                message: "category not found",
            });
        }

        res.status(200).json({
            success: true,
            data: category,
        });
    }
    catch (err) {
        console.error("Failed to fetch category:", err);
        res.status(500).json({
            success: false,
            message: "Failed to fetch category",
        });
    }
});

// POST /api/categories
router.post("/", async (req: Request, res: Response) => {
    try {
        const { userId, name, color } = req.body;

        if (typeof userId !== "string" || !userId.trim()) {
            res.status(400).json({
                success: false,
                message: "userId is required",
            });
      
            return;
        }

        if (typeof name !== "string" || !name.trim()) {
            res.status(400).json({
                success: false,
                message: "name is required",
            });
      
            return;
        }

        if (color !== undefined && !isValidColor(color)) {
            res.status(400).json({
                success: false,
                message: "color must be a valid hex color, e.g. #64748b",
            });
      
            return;
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true },
        });

        if (!user) {
            res.status(404).json({
                success: false,
                message: "User not found",
            });
      
            return;
        }

        const category = await prisma.category.create({
            data: {
                name: name.trim(),
                color: color ?? "#64748b",
                userId,
            },
        });

        res.status(201).json({
            success: true,
            message: "Category created successfully",
            data: category,
        });
    } 
    catch (err) {
        if (typeof err === "object" && err !== null && "code" in err && err.code === "P2002") {
            res.status(409).json({
                success: false,
                message: "A category with this name already exists for this user",
            });
      
            return;
        }

        console.error("Failed to create category:", err);
        res.status(500).json({
            success: false,
            message: "Failed to create category",
        });
    }
});

// PATCH /api/categories/:id
router.patch("/:id", async (req: Request, res: Response) => {
    try {
        const categoryId = req.params.id;
        const { userId, name, color } = req.body;

        if (typeof categoryId !== "string") {
            res.status(400).json({
                success: false,
                message: "Invalid category ID",
            });
      
            return;
        }

        if (typeof userId !== "string" || !userId.trim()) {
            res.status(400).json({
                success: false,
                message: "userId is required in the request body",
            });
      
            return;
        }

        const data: { name?: string; color?: string } = {};

        if (name !== undefined) {
            if (typeof name !== "string" || !name.trim()) {
                res.status(400).json({
                    success: false,
                    message: "name must be a non-empty string",
                });
        
                return;
            }
            data.name = name.trim();
        }

        if (color !== undefined) {
            if (!isValidColor(color)) {
                res.status(400).json({
                    success: false,
                    message: "color must be a valid hex color, e.g. #64748b",
                });
        
                return;
            }
            data.color = color;
        }

        if (Object.keys(data).length === 0) {
            res.status(400).json({
                success: false,
                message: "Provide at least one field to update",
            });
            
            return;
        }

        const existingCategory = await prisma.category.findFirst({
            where: { id: categoryId, userId },
            select: { id: true },
        });

        if (!existingCategory) {
            res.status(404).json({
                success: false,
                message: "Category not found",
            });
      
            return;
        }

        const category = await prisma.category.update({
            where: { id: categoryId },
            data,
        });

        res.status(200).json({
            success: true,
            message: "Category updated successfully",
            data: category,
        });
    } 
    catch (err) {
        if (typeof err === "object" && err !== null && "code" in err && err.code === "P2002") {
            res.status(409).json({
                success: false,
                message: "A category with this name already exists for this user",
            });
        
            return;
        }

        console.error("Failed to update category:", err);
        res.status(500).json({
            success: false,
            message: "Failed to update category",
        });
    }
});

// DELETE /api/categories/:id?userId=...
router.delete("/:id", async (req: Request, res: Response) => {
    try {
        const categoryId = req.params.id;
        const userId = typeof req.query.userId === "string" ? req.query.userId : "";

        if (typeof categoryId !== "string") {
            res.status(400).json({
                success: false,
                message: "Invalid category ID",
            });
      
            return;
        }

        if (!userId) {
            res.status(400).json({
                success: false,
                message: "userId is required",
            });
      
            return;
        }

        const category = await prisma.category.findFirst({
            where: { id: categoryId, userId },
            select: { id: true },
        });

        if (!category) {
            res.status(404).json({
                success: false,
                message: "Category not found",
            });
      
            return;
        }

        // The schema uses onDelete: SetNull, so linked transactions
        // are preserved but no longer reference this category.
        await prisma.category.delete({
            where: { id: categoryId },
        });

        res.status(200).json({
            success: true,
            message: "Category deleted successfully. Linked transactions were preserved.",
        });
    } 
    catch (err) {
        console.error("Failed to delete category:", err);
        res.status(500).json({
            success: false,
            message: "Failed to delete category",
        });
    }
});

export default router;