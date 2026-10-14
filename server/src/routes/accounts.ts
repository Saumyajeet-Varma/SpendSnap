import { Router } from "express";
import type { Request, Response } from "express";
import { AccountType } from "../../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { authenticateToken } from "../middlewares/auth.js";

const router = Router();
const validAccountTypes = Object.values(AccountType)

router.use(authenticateToken);

// GET /api/accounts/
router.get("/", async (req: Request, res: Response) => {
    try {
        const userId = req.user!.id;

        if (!userId) {
            res.status(400).json({
                success: false,
                message: "userId is required",
            });

            return;
        }

        const accounts = await prisma.account.findMany({
            where: { userId },
            include: {
                _count: {
                    select: { transactions: true },
                },
            },
            orderBy: { createdAt: "desc" },
        });

        res.status(200).json({
            success: true,
            data: accounts,
        });
    }
    catch (err) {
        console.error("Failed to fetch accounts:", err);
        res.status(500).json({
            success: false,
            message: "Failed to fetch accounts",
        });
    }
})

// GET /api/accounts/:id
router.get("/:id", async (req: Request, res: Response) => {
    try {
        const accountId = req.params.id;
        const userId = req.user!.id;

        if (typeof accountId !== "string") {
            res.status(400).json({
                success: false,
                message: "Invalid account ID",
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

        const account = await prisma.account.findFirst({
            where: { id: accountId, userId },
            include: {
                transactions: {
                    orderBy: { date: "desc" },
                    take: 20,
                    include: { category: true },
                },
                _count: {
                    select: { transactions: true },
                },
            },
        });

        if (!account) {
            res.status(404).json({
                success: false,
                message: "Account not found",
            });
    
            return;
        }

        res.status(200).json({ 
            success: true, 
            data: account 
        });
    } 
    catch (err) {
        console.error("Failed to fetch account:", err);
        res.status(500).json({
            success: false,
            message: "Failed to fetch account",
        });
    }
});

// POST /api/accounts
router.post("/", async (req: Request, res: Response) => {
    try {
        const { name, type, currency, openingBalance } = req.body;
        const userId = req.user!.id;

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

        if (type !== undefined && (typeof type !== "string" || !validAccountTypes.includes(type as AccountType))) {
            res.status(400).json({
                success: false,
                message: "type must be BANK, CASH, CREDIT_CARD, or WALLET",
            });
      
            return;
        }

        if (currency !== undefined && (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency))) {
            res.status(400).json({
                success: false,
                message: "currency must be a three-letter uppercase code, e.g. INR",
            });
      
            return;
        }

        const balance = openingBalance ?? 0;

        if (!Number.isSafeInteger(balance)) {
            res.status(400).json({
                success: false,
                message: "openingBalance must be an integer in paise",
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

        const account = await prisma.account.create({
            data: {
                name: name.trim(),
                type: type as AccountType | undefined,
                currency: currency ?? "INR",
                openingBalance: balance,
                userId,
            },
        });

        res.status(201).json({
            success: true,
            message: "Account created successfully",
            data: account,
        });
    }
    catch (err) {
        if (typeof err === "object" && err !== null && "code" in err && err.code === "P2002") {
            res.status(409).json({
                success: false,
                message: "An account with this name already exists for this user",
            });
      
            return;
        }

        console.error("Failed to create account:", err);
        res.status(500).json({
            success: false,
            message: "Failed to create account",
        });
    }
})

// PATCH /api/accounts/:id
router.patch("/:id", async (req: Request, res: Response) => {
    try {
        const accountId = req.params.id;
        const { name, type, currency, openingBalance } = req.body;
        const userId = req.user!.id;

        if (typeof accountId !== "string") {
            res.status(400).json({
                success: false,
                message: "Invalid account ID",
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

        const data: {
            name?: string;
            type?: AccountType;
            currency?: string;
            openingBalance?: number;
        } = {};

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

        if (type !== undefined) {
            if (typeof type !== "string" || !validAccountTypes.includes(type as AccountType)) {
                res.status(400).json({
                    success: false,
                    message: "Invalid account type",
                });
        
                return;
            }
            data.type = type as AccountType;
        }

        if (currency !== undefined) {
            if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) {
                res.status(400).json({
                    success: false,
                    message: "currency must be a three-letter uppercase code",
                });
        
                return;      
            }
            data.currency = currency;
        }

        if (openingBalance !== undefined) {
            if (!Number.isSafeInteger(openingBalance)) {
                res.status(400).json({
                    success: false,
                    message: "openingBalance must be an integer in paise",
                });
        
                return;
            }
            data.openingBalance = openingBalance;
        }

        if (Object.keys(data).length === 0) {
            res.status(400).json({
                success: false,
                message: "Provide at least one field to update",
            });
      
            return;
        }

        const existingAccount = await prisma.account.findFirst({
            where: { id: accountId, userId },
            select: { id: true },
        });

        if (!existingAccount) {
            res.status(404).json({
                success: false,
                message: "Account not found",
            });
      
            return;
        }

        const account = await prisma.account.update({
            where: { id: accountId },
            data,
        });

        res.status(200).json({
            success: true,
            message: "Account updated successfully",
            data: account,
        });
    } 
    catch (err) {
        if (typeof err === "object" && err !== null && "code" in err && err.code === "P2002") {
            res.status(409).json({
                success: false,
                message: "An account with this name already exists for this user",
            });
      
            return;
        }

        console.error("Failed to update account:", err);
        res.status(500).json({
            success: false,
            message: "Failed to update account",
        });
    }
});

// DELETE /api/accounts/:id
router.delete("/:id", async (req: Request, res: Response) => {
    try {
        const accountId = req.params.id;
        const userId = req.user!.id;

        if (typeof accountId !== "string") {
            res.status(400).json({
                success: false,
                message: "Invalid account ID",
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

        const account = await prisma.account.findFirst({
            where: { id: accountId, userId },
            select: {
                id: true,
                _count: { select: { transactions: true } },
            },
        });

        if (!account) {
            res.status(404).json({
                success: false,
                message: "Account not found",
            });
      
            return;
        }

        if (account._count.transactions > 0) {
            res.status(409).json({
                success: false,
                message: "This account has transactions and cannot be deleted",
            });
            
            return;
        }

        await prisma.account.delete({
            where: { id: accountId },
        });

        res.status(200).json({
            success: true,
            message: "Account deleted successfully",
        });
    } 
    catch (err) {
        if (typeof err === "object" && err !== null && "code" in err && err.code === "P2003") {
            res.status(409).json({
                success: false,
                message: "Cannot delete this account because it has linked records",
            });
        
            return;
        }

        console.error("Failed to delete account:", err);
        res.status(500).json({
            success: false,
            message: "Failed to delete account",
        });
    }
});

export default router;