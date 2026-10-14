import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

const { prismaMock } = vi.hoisted(() => ({
    prismaMock: {
        tokenRevocation: {
            findUnique: vi.fn(),
        },
        transaction: {
            findMany: vi.fn(),
            create: vi.fn(),
        },
        account: {
            findFirst: vi.fn(),
        },
        category: {
            findFirst: vi.fn(),
        },
    },
}));

vi.mock("../lib/prisma.js", () => ({
    prisma: prismaMock,
}));

import app from "../app.js";

const USER_ID = "user-1";
const OTHER_USER_ID = "user-2";
const ACCOUNT_ID = "account-1";
const CATEGORY_ID = "category-1";
const TRANSACTION_ID = "transaction-1";
const JWT_SECRET = "test-secret-for-transactions";

function createToken(userId = USER_ID) {
    return jwt.sign(
        { sub: userId, jti: `test-${userId}` },
        JWT_SECRET,
        { expiresIn: "1h" },
    );
}

function authenticatedRequest(token = createToken()) {
    return { Authorization: `Bearer ${token}` };
}

const validTransaction = {
    accountId: ACCOUNT_ID,
    categoryId: CATEGORY_ID,
    description: "Lunch",
    amount: 25000,
    type: "EXPENSE",
    date: "2026-10-14T12:00:00.000Z",
};

describe("Transactions API", () => {
    beforeEach(() => {
        vi.stubEnv("JWT_SECRET", JWT_SECRET);
        vi.clearAllMocks();

        prismaMock.tokenRevocation.findUnique.mockResolvedValue(null);
        prismaMock.transaction.findMany.mockResolvedValue([]);

        prismaMock.account.findFirst.mockResolvedValue({
            id: ACCOUNT_ID,
            userId: USER_ID,
        });

        prismaMock.category.findFirst.mockResolvedValue({
            id: CATEGORY_ID,
            userId: USER_ID,
        });

        prismaMock.transaction.create.mockResolvedValue({
            id: TRANSACTION_ID,
            ...validTransaction,
            userId: USER_ID,
        });
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    describe("Authentication", () => {
        it("rejects requests without a token", async () => {
            const response = await request(app).get("/api/transactions");

            expect(response.status).toBe(401);
            expect(prismaMock.transaction.findMany).not.toHaveBeenCalled();
        });

        it("rejects an invalid token", async () => {
            const response = await request(app)
                .get("/api/transactions")
                .set("Authorization", "Bearer invalid-token");

            expect(response.status).toBe(401);
        });
    });

    describe("GET /api/transactions", () => {
        it("returns transactions for the authenticated user", async () => {
            prismaMock.transaction.findMany.mockResolvedValue([
                { id: TRANSACTION_ID, amount: 25000, userId: USER_ID },
            ]);

            const response = await request(app)
                .get("/api/transactions")
                .set(authenticatedRequest());

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveLength(1);

            expect(prismaMock.transaction.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { userId: USER_ID },
                    include: {
                        account: true,
                        category: true,
                    },
                    orderBy: { date: "desc" },
                }),
            );
        });

        it("returns an empty array when there are no transactions", async () => {
            const response = await request(app)
                .get("/api/transactions")
                .set(authenticatedRequest());

            expect(response.status).toBe(200);
            expect(response.body.data).toEqual([]);
        });

        it("returns 500 when fetching transactions fails", async () => {
            prismaMock.transaction.findMany.mockRejectedValue(
                new Error("Database error"),
            );

            const response = await request(app)
                .get("/api/transactions")
                .set(authenticatedRequest());

            expect(response.status).toBe(500);
            expect(response.body.success).toBe(false);
        });
    });

    describe("POST /api/transactions", () => {
        it("creates a transaction successfully", async () => {
            const response = await request(app)
                .post("/api/transactions")
                .set(authenticatedRequest())
                .send(validTransaction);

            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);

            expect(prismaMock.account.findFirst).toHaveBeenCalledWith({
                where: { id: ACCOUNT_ID, userId: USER_ID },
            });

            expect(prismaMock.category.findFirst).toHaveBeenCalledWith({
                where: { id: CATEGORY_ID, userId: USER_ID },
            });

            expect(prismaMock.transaction.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        description: "Lunch",
                        amount: 25000,
                        type: "EXPENSE",
                        user: { connect: { id: USER_ID } },
                        account: { connect: { id: ACCOUNT_ID } },
                        category: { connect: { id: CATEGORY_ID } },
                    }),
                    include: {
                        account: true,
                        category: true,
                    },
                }),
            );
        });

        it("uses the authenticated user ID instead of a supplied userId", async () => {
            await request(app)
                .post("/api/transactions")
                .set(authenticatedRequest())
                .send({ ...validTransaction, userId: OTHER_USER_ID });

            expect(prismaMock.transaction.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        user: { connect: { id: USER_ID } },
                    }),
                }),
            );
        });

        it("rejects a missing accountId", async () => {
            const { accountId, ...body } = validTransaction;

            const response = await request(app)
                .post("/api/transactions")
                .set(authenticatedRequest())
                .send(body);

            expect(response.status).toBe(400);
            expect(prismaMock.transaction.create).not.toHaveBeenCalled();
        });

        it.each([
            ["zero", 0],
            ["negative", -100],
            ["decimal", 10.5],
            ["string", "100"],
            ["unsafe integer", Number.MAX_SAFE_INTEGER + 1],
            ["missing", undefined],
        ])("rejects an invalid amount (%s)", async (_label, amount) => {
            const body = { ...validTransaction, amount };

            if (amount === undefined) {
                delete (body as { amount?: number }).amount;
            }

            const response = await request(app)
                .post("/api/transactions")
                .set(authenticatedRequest())
                .send(body);

            expect(response.status).toBe(400);
            expect(prismaMock.transaction.create).not.toHaveBeenCalled();
        });

        it("rejects an invalid transaction type", async () => {
            const response = await request(app)
                .post("/api/transactions")
                .set(authenticatedRequest())
                .send({ ...validTransaction, type: "TRANSFER" });

            expect(response.status).toBe(400);
        });

        it("rejects an invalid date", async () => {
            const response = await request(app)
                .post("/api/transactions")
                .set(authenticatedRequest())
                .send({ ...validTransaction, date: "not-a-date" });

            expect(response.status).toBe(400);
        });

        it("rejects a non-string description", async () => {
            const response = await request(app)
                .post("/api/transactions")
                .set(authenticatedRequest())
                .send({ ...validTransaction, description: 123 });

            expect(response.status).toBe(400);
        });

        it("rejects a non-string categoryId", async () => {
            const response = await request(app)
                .post("/api/transactions")
                .set(authenticatedRequest())
                .send({ ...validTransaction, categoryId: 123 });

            expect(response.status).toBe(400);
        });

        it("allows a transaction without a category", async () => {
            const { categoryId, ...body } = validTransaction;

            const response = await request(app)
                .post("/api/transactions")
                .set(authenticatedRequest())
                .send(body);

            expect(response.status).toBe(201);
            expect(prismaMock.category.findFirst).not.toHaveBeenCalled();

            expect(prismaMock.transaction.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.not.objectContaining({
                        category: expect.anything(),
                    }),
                }),
            );
        });

        it("returns 404 if the account does not belong to the user", async () => {
            prismaMock.account.findFirst.mockResolvedValue(null);

            const response = await request(app)
                .post("/api/transactions")
                .set(authenticatedRequest(createToken(OTHER_USER_ID)))
                .send(validTransaction);

            expect(response.status).toBe(404);
            expect(prismaMock.transaction.create).not.toHaveBeenCalled();
        });

        it("returns 404 if the category does not belong to the user", async () => {
            prismaMock.category.findFirst.mockResolvedValue(null);

            const response = await request(app)
                .post("/api/transactions")
                .set(authenticatedRequest())
                .send(validTransaction);

            expect(response.status).toBe(404);
            expect(prismaMock.transaction.create).not.toHaveBeenCalled();
        });

        it("returns 500 when transaction creation fails", async () => {
            prismaMock.transaction.create.mockRejectedValue(
                new Error("Database error"),
            );

            const response = await request(app)
                .post("/api/transactions")
                .set(authenticatedRequest())
                .send(validTransaction);

            expect(response.status).toBe(500);
        });
    });
});
