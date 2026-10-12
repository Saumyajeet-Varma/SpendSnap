import { Router } from "express";
import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";

const router = Router();

const getJwtSecret = (): string => {
    const secret = process.env.JWT_SECRET;

    if (!secret) {
        throw new Error("JWT_SECRET is not configured");
    }

    return secret;
};

const expiresIn = process.env.JWT_EXPIRES_IN || "1d"
const tokenOptions : SignOptions = {
    expiresIn: expiresIn as SignOptions["expiresIn"]
}

// POST /api/auth/signup
router.post("/signup", async (req: Request, res: Response) => {
    try {
        const {email, password} = req.body as {
            email?: unknown;
            password?: unknown;
        };

        if(typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
            res.status(400).json({
                success: false,
                message: "Email and password are required",
            });

            return;
        }

        const normalizedEmail = email.trim().toLowerCase();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(normalizedEmail)) {
            res.status(400).json({
                success: false,
                message: "Please provide a valid email address",
            });

            return;
        }

        if(password.length < 8) {
            res.status(400).json({
                success: false,
                message: "Password must be at least 8 characters long",
            });

            return;
        }

        if(Buffer.byteLength(password, "utf-8") > 72) {
            res.status(400).json({
                success: false,
                message: "password must not exceed 72 bytes",
            });

            return;
        }

        const existingUser = await prisma.user.findUnique({
            where: { email: normalizedEmail },
        });

        if (existingUser) {
            res.status(409).json({
                success: false,
                message: "An account with this email already exists",
            });

            return;
        }

        const passwordHash = await bcrypt.hash(password, Number(process.env.HASH_ROUND));

        const user = await prisma.user.create({
            data: {
                email: normalizedEmail,
                passwordHash,
            },
            select: {
                id: true,
                email: true,
                createdAt: true,
            },
        });

        const token = jwt.sign(
            { sub: user.id, email: user.email },
            getJwtSecret(),
            tokenOptions,
        );

        res.status(201).json({
            success: true,
            message: "Account created successfully",
            data: {
                user,
                token,
            },
        });
    }
    catch (err) {
        if (typeof err === "object" && err !== null && "code" in err && err.code === "P2002") {
            res.status(409).json({
                success: false,
                message: "An account with this email already exists",
            });

            return;
        }

        console.error("Signup error:", err);
        res.status(500).json({
            success: false,
            message: "Failed to create account",
        });
    }
});

// POST /api/auth/login
router.post("/login", async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body as {
            email?: unknown;
            password?: unknown;
        };

        if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password ) {
            res.status(400).json({
                success: false,
                message: "Email and password are required",
            });

            return;
        }

        const normalizedEmail = email.trim().toLowerCase();

        const user = await prisma.user.findUnique({
            where: { email: normalizedEmail },
        });

        if (!user) {
            res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });

            return;
        }

        const passwordMatches = await bcrypt.compare(password, user.passwordHash);

        if (!passwordMatches) {
            res.status(401).json({
                success: false,
                message: "Invalid email or password",
            });

            return;
        }

        const token = jwt.sign(
            { sub: user.id, email: user.email },
            getJwtSecret(),
            tokenOptions,
        );

        res.status(200).json({
            success: true,
            message: "Login successful",
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    createdAt: user.createdAt,
                },
                token,
            },
        });
    }
    catch (err) {
        console.error("Login error:", err);
        res.status(500).json({
            success: false,
            message: "Failed to log in",
        });
    }
});

export default router;