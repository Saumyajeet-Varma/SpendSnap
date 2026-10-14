import "dotenv/config";
import express from "express";
import cors from "cors";
import { prisma } from "./lib/prisma.js";

import authRoutes from "./routes/auth.js";
import accountRoutes from "./routes/accounts.js";
import categoryRoutes from "./routes/categories.js";
import transactionRoutes from "./routes/transactions.js";

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173" }));
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/accounts", accountRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/transactions", transactionRoutes);

app.get("/api/health", (_req, res) => {
    res.status(200).json({
        success: true,
        message: "Server is running",
        data: {
            service: "spendsnap-api",
            version: "0.1.0",
            status: "healthy",
        },
    });
});

app.get("/api/health/db", async (_req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.status(200).json({
            success: true,
            message: "SpendSnap DB connected successfully",
            data: {
                database: "spendsnap",
                status: "connected",
            },
        });
    } 
    catch (err) {
        console.error("Database health check failed:", err);
        res.status(500).json({
            success: false,
            message: "Databse connection failed",
        });
    }
});

export default app