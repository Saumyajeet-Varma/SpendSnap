
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

const { prismaMock } = vi.hoisted(() => ({
    prismaMock: {
        account: {
            findMany: vi.fn(),
            findFirst: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
        },
        user: {
            findUnique: vi.fn(),
        },
        tokenRevocation: {
            findUnique: vi.fn(),
        },
    },
}));

vi.mock("../lib/prisma.js", () => ({
    prisma: prismaMock,
}));

import app from "../app.js";

const userId = "test-user-1";
const accountId = "test-account-1";
const JWT_SECRET = "test-secret-for-accounts";

function createToken(tokenUserId = userId) {
    return jwt.sign(
        {
            sub: tokenUserId,
            jti: `test-${tokenUserId}`,
        },
        JWT_SECRET,
        {
            expiresIn: "1h",
        },
    );
}

function authenticatedRequest(token = createToken()) {
    return {
        Authorization: `Bearer ${token}`,
    };
}

const mockAccount = {
    id: accountId,
    name: "Savings",
    type: "BANK",
    currency: "INR",
    openingBalance: 100000,
    userId,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("Accounts API", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        vi.stubEnv("JWT_SECRET", JWT_SECRET);

        prismaMock.tokenRevocation.findUnique.mockResolvedValue(null);

        prismaMock.user.findUnique.mockResolvedValue({
            id: userId,
        });

        prismaMock.account.findMany.mockResolvedValue([]);
        prismaMock.account.findFirst.mockResolvedValue(mockAccount);
        prismaMock.account.create.mockResolvedValue(mockAccount);
        prismaMock.account.update.mockResolvedValue({
            ...mockAccount,
            name: "Updated Savings",
        });
        prismaMock.account.delete.mockResolvedValue(mockAccount);
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    // GET /api/accounts
    describe("GET /api/accounts", () => {
        it("should return 401 when the authorization token is missing", async () => {
            const response = await request(app).get("/api/accounts");

            expect(response.status).toBe(401);
            expect(prismaMock.account.findMany).not.toHaveBeenCalled();
        });

        it("should return all accounts for the authenticated user", async () => {
            prismaMock.account.findMany.mockResolvedValue([mockAccount]);

            const response = await request(app)
                .get("/api/accounts")
                .set(authenticatedRequest());

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveLength(1);
            expect(response.body.data[0].id).toBe(accountId);

            expect(prismaMock.account.findMany).toHaveBeenCalledWith({
                where: {
                    userId,
                },
                include: {
                    _count: {
                        select: {
                            transactions: true,
                        },
                    },
                },
                orderBy: {
                    createdAt: "desc",
                },
            });
        });

        it("should not allow a query parameter to override the authenticated user", async () => {
            prismaMock.account.findMany.mockResolvedValue([mockAccount]);

            const response = await request(app)
                .get("/api/accounts")
                .set(authenticatedRequest())
                .query({
                    userId: "another-user",
                });

            expect(response.status).toBe(200);

            expect(prismaMock.account.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        userId,
                    },
                }),
            );
        });
    });

    // GET /api/accounts/:id
    describe("GET /api/accounts/:id", () => {
        it("should return an account with its transaction count", async () => {
            const accountWithTransactions = {
                ...mockAccount,
                transactions: [],
                _count: {
                    transactions: 0,
                },
            };

            prismaMock.account.findFirst.mockResolvedValue(
                accountWithTransactions,
            );

            const response = await request(app)
                .get(`/api/accounts/${accountId}`)
                .set(authenticatedRequest());

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.id).toBe(accountId);
            expect(response.body.data._count.transactions).toBe(0);

            expect(prismaMock.account.findFirst).toHaveBeenCalledWith({
                where: {
                    id: accountId,
                    userId,
                },
                include: {
                    transactions: {
                        orderBy: {
                            date: "desc",
                        },
                        take: 20,
                        include: {
                            category: true,
                        },
                    },
                    _count: {
                        select: {
                            transactions: true,
                        },
                    },
                },
            });
        });

        it("should return 401 when the authorization token is missing", async () => {
            const response = await request(app)
                .get(`/api/accounts/${accountId}`);

            expect(response.status).toBe(401);
            expect(prismaMock.account.findFirst).not.toHaveBeenCalled();
        });

        it("should return 404 when the account is not found", async () => {
            prismaMock.account.findFirst.mockResolvedValue(null);

            const response = await request(app)
                .get(`/api/accounts/${accountId}`)
                .set(authenticatedRequest());

            expect(response.status).toBe(404);
            expect(response.body.message).toBe("Account not found");
        });
    });

    // POST /api/accounts
    describe("POST /api/accounts", () => {
        it("should create an account successfully", async () => {
            const response = await request(app)
                .post("/api/accounts")
                .set(authenticatedRequest())
                .send({
                    name: "Savings",
                    type: "BANK",
                    currency: "INR",
                    openingBalance: 100000,
                });

            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe(
                "Account created successfully",
            );

            expect(prismaMock.account.create).toHaveBeenCalledWith({
                data: {
                    userId,
                    name: "Savings",
                    type: "BANK",
                    currency: "INR",
                    openingBalance: 100000,
                },
            });
        });

        it("should return 401 when the authorization token is missing", async () => {
            const response = await request(app)
                .post("/api/accounts")
                .send({
                    name: "Savings",
                });

            expect(response.status).toBe(401);
            expect(prismaMock.account.create).not.toHaveBeenCalled();
        });

        it("should reject an empty account name", async () => {
            const response = await request(app)
                .post("/api/accounts")
                .set(authenticatedRequest())
                .send({
                    name: "   ",
                });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("name is required");
        });

        it("should reject an invalid account type", async () => {
            const response = await request(app)
                .post("/api/accounts")
                .set(authenticatedRequest())
                .send({
                    name: "Savings",
                    type: "INVALID",
                });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe(
                "type must be BANK, CASH, CREDIT_CARD, or WALLET",
            );

            expect(prismaMock.account.create).not.toHaveBeenCalled();
        });

        it("should reject an invalid currency code", async () => {
            const response = await request(app)
                .post("/api/accounts")
                .set(authenticatedRequest())
                .send({
                    name: "Savings",
                    currency: "inr",
                });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe(
                "currency must be a three-letter uppercase code, e.g. INR",
            );
        });

        it("should reject a non-integer opening balance", async () => {
            const response = await request(app)
                .post("/api/accounts")
                .set(authenticatedRequest())
                .send({
                    name: "Savings",
                    openingBalance: 100.5,
                });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe(
                "openingBalance must be an integer in paise",
            );
        });

        it("should return 404 when the authenticated user does not exist", async () => {
            prismaMock.user.findUnique.mockResolvedValue(null);

            const response = await request(app)
                .post("/api/accounts")
                .set(authenticatedRequest())
                .send({
                    name: "Savings",
                });

            expect(response.status).toBe(404);
            expect(response.body.message).toBe("User not found");
        });

        it("should return 409 when the account name already exists", async () => {
            prismaMock.account.create.mockRejectedValue({
                code: "P2002",
            });

            const response = await request(app)
                .post("/api/accounts")
                .set(authenticatedRequest())
                .send({
                    name: "Savings",
                });

            expect(response.status).toBe(409);
            expect(response.body.message).toBe(
                "An account with this name already exists for this user",
            );
        });

        it("should use the authenticated user instead of a supplied userId", async () => {
            const response = await request(app)
                .post("/api/accounts")
                .set(authenticatedRequest())
                .send({
                    userId: "another-user",
                    name: "Savings",
                    type: "BANK",
                    currency: "INR",
                    openingBalance: 100000,
                });

            expect(response.status).toBe(201);

            expect(prismaMock.account.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    userId,
                }),
            });
        });
    });

    // PATCH /api/accounts/:id
    describe("PATCH /api/accounts/:id", () => {
        it("should update an account successfully", async () => {
            const response = await request(app)
                .patch(`/api/accounts/${accountId}`)
                .set(authenticatedRequest())
                .send({
                    name: "Updated Savings",
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe(
                "Account updated successfully",
            );
            expect(response.body.data.name).toBe("Updated Savings");

            expect(prismaMock.account.findFirst).toHaveBeenCalledWith({
                where: {
                    id: accountId,
                    userId,
                },
                select: {
                    id: true,
                },
            });

            expect(prismaMock.account.update).toHaveBeenCalledWith({
                where: {
                    id: accountId,
                },
                data: {
                    name: "Updated Savings",
                },
            });
        });

        it("should return 401 when the authorization token is missing", async () => {
            const response = await request(app)
                .patch(`/api/accounts/${accountId}`)
                .send({
                    name: "Updated Savings",
                });

            expect(response.status).toBe(401);
            expect(prismaMock.account.update).not.toHaveBeenCalled();
        });

        it("should reject an empty update", async () => {
            const response = await request(app)
                .patch(`/api/accounts/${accountId}`)
                .set(authenticatedRequest())
                .send({});

            expect(response.status).toBe(400);
            expect(response.body.message).toBe(
                "Provide at least one field to update",
            );

            expect(prismaMock.account.update).not.toHaveBeenCalled();
        });

        it("should return 404 when the account does not belong to the user", async () => {
            prismaMock.account.findFirst.mockResolvedValue(null);

            const response = await request(app)
                .patch(`/api/accounts/${accountId}`)
                .set(authenticatedRequest())
                .send({
                    name: "Updated Savings",
                });

            expect(response.status).toBe(404);
            expect(response.body.message).toBe("Account not found");
            expect(prismaMock.account.update).not.toHaveBeenCalled();
        });

        it("should not allow userId in the body to override the authenticated user", async () => {
            const response = await request(app)
                .patch(`/api/accounts/${accountId}`)
                .set(authenticatedRequest())
                .send({
                    userId: "another-user",
                    name: "Updated Savings",
                });

            expect(response.status).toBe(200);

            expect(prismaMock.account.findFirst).toHaveBeenCalledWith({
                where: {
                    id: accountId,
                    userId,
                },
                select: {
                    id: true,
                },
            });
        });
    });

    // DELETE /api/accounts/:id
    describe("DELETE /api/accounts/:id", () => {
        it("should delete an account without transactions", async () => {
            prismaMock.account.findFirst.mockResolvedValue({
                id: accountId,
                _count: {
                    transactions: 0,
                },
            });

            const response = await request(app)
                .delete(`/api/accounts/${accountId}`)
                .set(authenticatedRequest());

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe(
                "Account deleted successfully",
            );

            expect(prismaMock.account.delete).toHaveBeenCalledWith({
                where: {
                    id: accountId,
                },
            });
        });

        it("should return 401 when the authorization token is missing", async () => {
            const response = await request(app)
                .delete(`/api/accounts/${accountId}`);

            expect(response.status).toBe(401);
            expect(prismaMock.account.delete).not.toHaveBeenCalled();
        });

        it("should reject deletion when the account has transactions", async () => {
            prismaMock.account.findFirst.mockResolvedValue({
                id: accountId,
                _count: {
                    transactions: 2,
                },
            });

            const response = await request(app)
                .delete(`/api/accounts/${accountId}`)
                .set(authenticatedRequest());

            expect(response.status).toBe(409);
            expect(response.body.message).toBe(
                "This account has transactions and cannot be deleted",
            );

            expect(prismaMock.account.delete).not.toHaveBeenCalled();
        });

        it("should return 404 when the account is not found", async () => {
            prismaMock.account.findFirst.mockResolvedValue(null);

            const response = await request(app)
                .delete(`/api/accounts/${accountId}`)
                .set(authenticatedRequest());

            expect(response.status).toBe(404);
            expect(response.body.message).toBe("Account not found");
            expect(prismaMock.account.delete).not.toHaveBeenCalled();
        });
    });
});
