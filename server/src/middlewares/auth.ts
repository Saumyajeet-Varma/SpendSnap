import type { Request, Response, NextFunction } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";

declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                email?: string;
            };
        }
    }
}

export const authenticateToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
        res.status(401).json({
            success: false,
            message: "Authentication token is required",
        });

        return;
    }

    const token = authorization.slice(7).trim();

    if (!token) {
        res.status(401).json({
            success: false,
            message: "Authentication token is required",
        });

        return;
    }

    const secret = process.env.JWT_SECRET;

    if (!secret) {
        console.error("JWT_SECRET is not configured");
        res.status(500).json({
            success: false,
            message: "Authentication service is not configured",
        });

        return;
    }

    try {
        const decoded = jwt.verify(token, secret);

        if (typeof decoded === "string" || typeof decoded.sub !== "string" || typeof decoded.jti !== "string" || typeof decoded.exp !== "number" || !decoded.jti) {
            res.status(401).json({
                success: false,
                message: "Invalid authentication token",
            });

            return;
        }

        const payload = decoded as JwtPayload;

        const revokedToken = await prisma.tokenRevocation.findUnique({
            where: { jti: payload.jti as string },
        });

        if (revokedToken) {
            res.status(401).json({
                success: false,
                message: "Token has been revoked. Please login again",
            });

            return;
        }

        req.user = {
            id: payload.sub as string,
            ...(typeof payload.email === "string" ? { email: payload.email } : {}),
        };

        next();
    }
    catch (err) {
        if (err instanceof jwt.JsonWebTokenError) {
            res.status(401).json({
                success: false,
                message: "Invalid or expired authentication token",
            });

            return;
        }

        console.error("Authnetication service problem occurred:", err)
        res.status(401).json({
            success: false,
            message: "Invalid or expired authentication token",
        });
    }
};