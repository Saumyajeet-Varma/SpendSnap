import { Router } from "express";
import type { Request, Response } from "express";
import { TransactionType } from "../../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { authenticateToken } from "../middlewares/auth.js";

const router = Router();
const validTransactionTypes = Object.values(TransactionType);

router.use(authenticateToken);

// GET /api/transactions?userId=...
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

        const transactions = await prisma.transaction.findMany({
            where: { userId },
            include: {
                account: true,
                category: true,
            },
            orderBy: { date: "desc" }
        });

        res.status(200).json({
            success: true,
            data: transactions
        })
    }
    catch (err) {
        console.error("Failed to fetch transactions:", err);
        res.status(500).json({
            success: false,
            message: "Failed to fetch transactions",
        });
    }
});

// POST /api/transactions
router.post("/", async (req: Request, res: Response) => {
    try {
        const { userId, accountId, categoryId, description, amount, type, date } = req.body;

        if (typeof userId !== "string" || !userId.trim() || typeof accountId !== "string" || !accountId.trim()) {
            res.status(400).json({
                success: false,
                message: "userId and accountId are required",
            });

            return;
        }

        if (!Number.isSafeInteger(amount) || amount <= 0) {
            res.status(400).json({
                success: false,
                message: "amount must be a positive integer in paise",
            });
      
            return;
        }

        if (typeof type !== "string" || !validTransactionTypes.includes(type as TransactionType)) {
            res.status(400).json({
                success: false,
                message: "type must be EXPENSE, INCOME, or REFUND",
            });
      
            return;
        }

        const transactionDate = date === undefined ? new Date() : new Date(date);

        if (Number.isNaN(transactionDate.getTime())) {
            res.status(400).json({
                success: false,
                message: "date must be a valid date",
            });

            return;
        }

        if (description !== undefined && description !== null && typeof description !== "string") {
            res.status(400).json({
                success: false,
                message: "description must be a string",
            });

            return;
        }

        if (categoryId !== undefined && categoryId !== null && typeof categoryId !== "string") {
            res.status(400).json({
                success: false,
                message: "categoryId must be a string",
            });

            return;
        }

        const account = await prisma.account.findFirst({
            where: { id: accountId, userId },
        });

        if (!account) {
            res.status(404).json({
                success: false,
                message: "Account not found for this user",
            });

            return;
        }

        if (categoryId) {
            const category = await prisma.category.findFirst({
                where: { id: categoryId, userId },
            });

            if (!category) {
                res.status(404).json({
                    success: false,
                    message: "Category not found for this user",
                });

                return;
            }
        }

        const transaction = await prisma.transaction.create({
            data: {
                description: description?.trim() || null,
                amount,
                type: type as TransactionType,
                date: transactionDate,
                user: { connect: { id: userId } },
                account: { connect: { id: accountId } },
                ...( categoryId ? { category: { connect: { id: categoryId } } } : {} )
            },
            include: {
                account: true,
                category: true,
            },
        });

        res.status(201).json({
            success: true,
            message: "transaction created successfully",
            data: transaction,
        });
    }
    catch (err) {
        console.error("Failed to create transaction:", err);
        res.status(500).json({
            success: false,
            message: "Failed to create transaction",
        });
    }
});

export default router;