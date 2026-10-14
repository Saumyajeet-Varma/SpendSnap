import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";

const getJwtSecret = (): string => {
    const secret = process.env.JWT_SECRET;

    if (!secret) {
        throw new Error("JWT_SECRET is not configured");
    }

    return secret;
};

const expiresIn = process.env.JWT_EXPIRES_IN || "1d";

const tokenOptions: SignOptions = {
    expiresIn: expiresIn as SignOptions["expiresIn"],
};

const isPrismaErrorCode = (err: unknown, code: string): boolean =>
    typeof err === "object" && err !== null && "code" in err && err.code === code;

// POST /api/auth/signup
export const signup = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password } = req.body as {
            email?: unknown;
            password?: unknown;
        };

        if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
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

        if (password.length < 8) {
            res.status(400).json({
                success: false,
                message: "Password must be at least 8 characters long",
            });
            return;
        }

        if (Buffer.byteLength(password, "utf-8") > 72) {
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

        const hashRounds = Number(process.env.HASH_ROUND);

        if (!Number.isInteger(hashRounds) || hashRounds < 1) {
            throw new Error("HASH_ROUND must be configured as a positive integer");
        }

        const passwordHash = await bcrypt.hash(password, hashRounds);

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
            {
                sub: user.id,
                email: user.email,
                jti: randomUUID(),
            },
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
        if (isPrismaErrorCode(err, "P2002")) {
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
};

// POST /api/auth/login
export const login = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password } = req.body as {
            email?: unknown;
            password?: unknown;
        };

        if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
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
                message: "Invalid email or password",
            });
            return;
        }

        const passwordMatches = await bcrypt.compare(
            password,
            user.passwordHash,
        );

        if (!passwordMatches) {
            res.status(401).json({
                success: false,
                message: "Invalid email or password",
            });
            return;
        }

        const token = jwt.sign(
            {
                sub: user.id,
                email: user.email,
                jti: randomUUID(),
            },
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
};

// GET /api/auth/profile
export const getProfile = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                createdAt: true,
            },
        });

        if (!user) {
            res.status(401).json({
                success: false,
                message: "User no longer exists",
            });
            return;
        }

        res.status(200).json({
            success: true,
            data: user,
        });
    } 
    catch (err) {
        console.error("Get current user error:", err);
        res.status(500).json({
            success: false,
            message: "Failed to fetch user profile",
        });
    }
};

// POST /api/auth/logout
export const logout = async (req: Request, res: Response): Promise<void> => {
    try {
        const authorization = req.headers.authorization;

        if (!authorization?.startsWith("Bearer ")) {
            res.status(401).json({
                success: false,
                message: "Invalid authentication token",
            });
            return;
        }

        const token = authorization.slice(7).trim();
        const decoded = jwt.verify(token, getJwtSecret());

        if (typeof decoded === "string" || typeof decoded.jti !== "string" || typeof decoded.exp !== "number") {
            res.status(401).json({
                success: false,
                message: "Invalid authentication token",
            });
            return;
        }

        await prisma.tokenRevocation.upsert({
            where: { jti: decoded.jti },
            create: {
                jti: decoded.jti,
                expiresAt: new Date(decoded.exp * 1000),
            },
            update: {},
        });

        res.status(200).json({
            success: true,
            message: "Logged out successfully",
        });
    } 
    catch (err) {
        if (err instanceof jwt.JsonWebTokenError) {
            res.status(401).json({
                success: false,
                message: "Invalid or expired authentication token",
            });
            return;
        }

        console.error("Logout error:", err);
        res.status(500).json({
            success: false,
            message: "Failed to logout",
        });
    }
};
