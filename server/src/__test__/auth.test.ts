import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const { prismaMock } = vi.hoisted(() => ({
    prismaMock: {
        user: {
            findUnique: vi.fn(),
            create: vi.fn(),
        },
        tokenRevocation: {
            findUnique: vi.fn(),
            upsert: vi.fn(),
        },
    },
}));

vi.mock("../lib/prisma.js", () => ({
    prisma: prismaMock,
}));

import app from "../app.js";

const TEST_SECRET = "test-secret-for-spendsnap";

const testUser = {
    id: "test-user-1",
    email: "test@example.com",
    passwordHash: "$2b$10$abcdefghijklmnopqrstuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

const createToken = (
    payload: Record<string, unknown> = {
        sub: testUser.id,
        email: testUser.email,
        jti: "test-token-id",
    }
) => 
    jwt.sign(payload, TEST_SECRET, {
        expiresIn: "1h",
    });

describe("Authentication API", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        vi.stubEnv("JWT_SECRET", TEST_SECRET);
        vi.stubEnv("JWT_EXPIRES_IN", "1d");
        vi.stubEnv("HASH_ROUND", "10");

        prismaMock.user.findUnique.mockResolvedValue(null);
        prismaMock.user.create.mockResolvedValue(testUser);
        prismaMock.tokenRevocation.findUnique.mockResolvedValue(null);
        prismaMock.tokenRevocation.upsert.mockResolvedValue({});
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    describe("POST /api/auth/signup", () => {
        it("should reject signup when fields are missing", async () => {
            const response = await request(app)
                .post("/api/auth/signup")
                .send({});

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.message).toBe("Email and password are required");
        });

        it("should create a user and return a JWT", async () => {
            const createdUser = {
                id: testUser.id,
                email: testUser.email,
                createdAt: testUser.createdAt,
            };

            prismaMock.user.create.mockResolvedValue(createdUser);

            const response = await request(app)
                .post("/api/auth/signup")
                .send({
                    email: " Test@Example.com ",
                    password: "StrongPass123",
                });

            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);
            expect(response.body.data.user.email).toBe("test@example.com");
            expect(response.body.data.token).toEqual(expect.any(String));

            const createCall = prismaMock.user.create.mock.calls[0][0];

            expect(createCall.data.email).toBe("test@example.com");
            expect(createCall.data.passwordHash).not.toBe("StrongPass123");

            expect(await bcrypt.compare("StrongPass123", createCall.data.passwordHash)).toBe(true);
        });

        it("should reject an invalid email", async () => {
            const response = await request(app)
                .post("/api/auth/signup")
                .send({
                    email: "invalid-email",
                    password: "StrongPass123",
                });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Please provide a valid email address");
        });

        it("should reject a password shorter than 8 characters", async () => {
            const response = await request(app)
                .post("/api/auth/signup")
                .send({
                    email: "test@example.com",
                    password: "short",
                });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Password must be at least 8 characters long");
        });

        it("should reject a password exceeding 72 bytes", async () => {
            const response = await request(app)
                .post("/api/auth/signup")
                .send({
                    email: "test@example.com",
                    password: "a".repeat(73),
                });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("password must not exceed 72 bytes");
        });

        it("should reject an existing email", async () => {
            prismaMock.user.findUnique.mockResolvedValue(testUser);

            const response = await request(app)
                .post("/api/auth/signup")
                .send({
                    email: "test@example.com",
                    password: "StrongPass123",
                });

            expect(response.status).toBe(409);
            expect(response.body.message).toBe("An account with this email already exists");
            expect(prismaMock.user.create).not.toHaveBeenCalled();
        });
    });

    describe("POST /api/auth/login", () => {
        it("should return a JWT for valid credentials", async () => {
            const passwordHash = await bcrypt.hash("StrongPass123", 10);

            prismaMock.user.findUnique.mockResolvedValue({
                ...testUser,
                passwordHash,
            });

            const response = await request(app)
                .post("/api/auth/login")
                .send({
                    email: " TEST@example.com ",
                    password: "StrongPass123",
                });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe("Login successful");
        expect(response.body.data.user.email).toBe("test@example.com");
        expect(response.body.data.token).toEqual(expect.any(String));

        const decoded = jwt.verify(
            response.body.data.token,
            TEST_SECRET
        );

        expect(decoded).toMatchObject({
            sub: testUser.id,
            email: testUser.email,
        });
    });

    it("should reject an unknown email", async () => {
        prismaMock.user.findUnique.mockResolvedValue(null);

        const response = await request(app)
            .post("/api/auth/login")
            .send({
                email: "unknown@example.com",
                password: "StrongPass123",
            });

        expect(response.status).toBe(401);
        expect(response.body.message).toBe("Invalid email or password");
    });

    it("should reject an incorrect password", async () => {
        const passwordHash = await bcrypt.hash("CorrectPass123", 10);

        prismaMock.user.findUnique.mockResolvedValue({
            ...testUser,
            passwordHash,
        });

        const response = await request(app)
            .post("/api/auth/login")
            .send({
                email: testUser.email,
                password: "WrongPass123",
            });

        expect(response.status).toBe(401);
        expect(response.body.message).toBe("Invalid email or password");
        });
    });

    describe("GET /api/auth/profile", () => {
        it("should reject a request without a token", async () => {
            const response = await request(app)
                .get("/api/auth/profile");

            expect(response.status).toBe(401);
            expect(response.body.message).toBe("Authentication token is required");
        });

        it("should reject an invalid token", async () => {
            const response = await request(app)
                .get("/api/auth/profile")
                .set("Authorization", "Bearer invalid-token");

            expect(response.status).toBe(401);
            expect(response.body.message).toBe("Invalid or expired authentication token");
        });
    
        it("should return the profile for a valid token", async () => {
            const token = createToken();
        
            prismaMock.user.findUnique.mockResolvedValue({
                id: testUser.id,
                email: testUser.email,
                createdAt: testUser.createdAt,
            });
        
            const response = await request(app)
                .get("/api/auth/profile")
                .set("Authorization", `Bearer ${token}`);
        
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data).toMatchObject({
                id: testUser.id,
                email: testUser.email,
            });
        
            expect(prismaMock.tokenRevocation.findUnique).toHaveBeenCalledWith({
                where: { jti: "test-token-id" },
            });
        });
    
        it("should reject a revoked token", async () => {
            const token = createToken();
        
            prismaMock.tokenRevocation.findUnique.mockResolvedValue({
                jti: "test-token-id",
                expiresAt: new Date(Date.now() + 60_000),
                createdAt: new Date(),
            });
        
            const response = await request(app)
                .get("/api/auth/profile")
                .set("Authorization", `Bearer ${token}`);
        
            expect(response.status).toBe(401);
            expect(response.body.message).toBe("Token has been revoked. Please login again");
        });
    
        it("should reject a token when the user no longer exists", async () => {
            const token = createToken();
        
            prismaMock.user.findUnique.mockResolvedValue(null);
        
            const response = await request(app)
                .get("/api/auth/profile")
                .set("Authorization", `Bearer ${token}`);
        
            expect(response.status).toBe(401);
            expect(response.body.message).toBe("User no longer exists");
        });
    });
    
    describe("POST /api/auth/logout", () => {
        it("should reject logout without a token", async () => {
            const response = await request(app)
                .post("/api/auth/logout");
        
            expect(response.status).toBe(401);
            expect(response.body.message).toBe("Authentication token is required");
        });
    
        it("should revoke the token on logout", async () => {
            const token = createToken();
        
            const response = await request(app)
                .post("/api/auth/logout")
                .set("Authorization", `Bearer ${token}`);
        
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
        
            expect(prismaMock.tokenRevocation.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { jti: "test-token-id" },
                    create: expect.objectContaining({
                        jti: "test-token-id",
                        expiresAt: expect.any(Date),
                    }),
                })
            );
        });

        it("should reject the token after logout", async () => {
            const token = createToken();

            prismaMock.tokenRevocation.findUnique.mockResolvedValue({
                jti: "test-token-id",
                expiresAt: new Date(Date.now() + 60_000),
                createdAt: new Date(),
            });

            const response = await request(app)
                .get("/api/auth/profile")
                .set("Authorization", `Bearer ${token}`);

            expect(response.status).toBe(401);
            expect(response.body.message).toBe("Token has been revoked. Please login again");
        });
    });
});