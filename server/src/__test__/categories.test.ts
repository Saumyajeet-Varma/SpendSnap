import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

const { prismaMock } = vi.hoisted(() => ({
    prismaMock: {
        user: {
            findUnique: vi.fn(),
        },
        tokenRevocation: {
            findUnique: vi.fn(),
        },
        category: {
            findMany: vi.fn(),
            findFirst: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
        },
    },
}));

vi.mock("../lib/prisma.js", () => ({
    prisma: prismaMock,
}));

import app from "../app.js";

const USER_ID = "user-1";
const OTHER_USER_ID = "user-2";
const CATEGORY_ID = "category-1";
const JWT_SECRET = "test-secret-for-categories";

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

describe("Categories API", () => {
    beforeEach(() => {
        vi.stubEnv("JWT_SECRET", JWT_SECRET);
        vi.clearAllMocks();

        prismaMock.tokenRevocation.findUnique.mockResolvedValue(null);
        prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID });
        prismaMock.category.findMany.mockResolvedValue([]);
        prismaMock.category.findFirst.mockResolvedValue(null);
        prismaMock.category.create.mockResolvedValue({
            id: CATEGORY_ID,
            name: "Food",
            color: "#64748b",
            userId: USER_ID,
        });
        prismaMock.category.update.mockResolvedValue({
            id: CATEGORY_ID,
            name: "Updated Food",
            color: "#ff0000",
            userId: USER_ID,
        });
        prismaMock.category.delete.mockResolvedValue({});
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    describe("Authentication", () => {
        it("rejects requests without a token", async () => {
            const response = await request(app).get("/api/categories");

            expect(response.status).toBe(401);
            expect(prismaMock.category.findMany).not.toHaveBeenCalled();
        });

        it("rejects an invalid token", async () => {
            const response = await request(app)
                .get("/api/categories")
                .set("Authorization", "Bearer invalid-token");

            expect(response.status).toBe(401);
        });
    });

    describe("GET /api/categories", () => {
        it("returns categories belonging to the authenticated user", async () => {
            prismaMock.category.findMany.mockResolvedValue([
                { id: CATEGORY_ID, name: "Food", userId: USER_ID },
            ]);

            const response = await request(app)
                .get("/api/categories")
                .set(authenticatedRequest());

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveLength(1);
            expect(prismaMock.category.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ 
                    where: { userId: USER_ID },
                }),
            );
        });

        it("returns an empty array when the user has no categories", async () => {
            const response = await request(app)
                .get("/api/categories")
                .set(authenticatedRequest());

            expect(response.status).toBe(200);
            expect(response.body.data).toEqual([]);
        });

        it("returns 500 when fetching categories fails", async () => {
            prismaMock.category.findMany.mockRejectedValue(
                new Error("Database error"),
            );

            const response = await request(app)
                .get("/api/categories")
                .set(authenticatedRequest());

            expect(response.status).toBe(500);
            expect(response.body.success).toBe(false);
        });
    });

    describe("GET /api/categories/:id", () => {
        it("returns a category owned by the authenticated user", async () => {
            prismaMock.category.findFirst.mockResolvedValue({
                id: CATEGORY_ID,
                name: "Food",
                userId: USER_ID,
            });

            const response = await request(app)
                .get(`/api/categories/${CATEGORY_ID}`)
                .set(authenticatedRequest());

            expect(response.status).toBe(200);
            expect(response.body.data.id).toBe(CATEGORY_ID);
            expect(prismaMock.category.findFirst).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: CATEGORY_ID, userId: USER_ID },
                }),
            );
        });

        it("returns 404 when the category does not belong to the user", async () => {
            prismaMock.category.findFirst.mockResolvedValue(null);

            const response = await request(app)
                .get(`/api/categories/${CATEGORY_ID}`)
                .set(authenticatedRequest( createToken(OTHER_USER_ID) ));

            expect(response.status).toBe(404);
            expect(response.body.success).toBe(false);
        });
    });

    describe("POST /api/categories", () => {
        it("creates a category with default color", async () => {
            const response = await request(app)
                .post("/api/categories")
                .set(authenticatedRequest())
                .send({ name: " Food " });

            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);
            expect(prismaMock.category.create).toHaveBeenCalledWith({
                data: {
                    name: "Food",
                    color: "#64748b",
                    userId: USER_ID,
                },
            });
        });

        it("creates a category with a supplied color", async () => {
            await request(app)
                .post("/api/categories")
                .set(authenticatedRequest())
                .send({ name: "Travel", color: "#12aBcD" });

            expect(prismaMock.category.create).toHaveBeenCalledWith({
                data: {
                    name: "Travel",
                    color: "#12aBcD",
                    userId: USER_ID,
                },
            });
        });

        it("uses the token user ID instead of a client-supplied userId", async () => {
            await request(app)
                .post("/api/categories")
                .set(authenticatedRequest())
                .send({ name: "Food", userId: OTHER_USER_ID });

            expect(prismaMock.category.create).toHaveBeenCalledWith({
                data: {
                    name: "Food",
                    color: "#64748b",
                    userId: USER_ID,
                },
            });
        });

        it("rejects a missing or empty name", async () => {
            for (const body of [{}, { name: "   " }, { name: 123 }]) {
                const response = await request(app)
                    .post("/api/categories")
                    .set(authenticatedRequest())
                    .send(body);

                expect(response.status).toBe(400);
            }

            expect(prismaMock.category.create).not.toHaveBeenCalled();
        });

        it("rejects an invalid color", async () => {
            const response = await request(app)
                .post("/api/categories")
                .set(authenticatedRequest())
                .send({ name: "Food", color: "red" });

            expect(response.status).toBe(400);
            expect(prismaMock.category.create).not.toHaveBeenCalled();
        });

        it("returns 409 for a duplicate category", async () => {
            prismaMock.category.create.mockRejectedValue({ code: "P2002" });

            const response = await request(app)
                .post("/api/categories")
                .set(authenticatedRequest())
                .send({ name: "Food" });

            expect(response.status).toBe(409);
        });

        it("returns 500 when category creation fails", async () => {
            prismaMock.category.create.mockRejectedValue(
                new Error("Database error"),
            );

            const response = await request(app)
                .post("/api/categories")
                .set(authenticatedRequest())
                .send({ name: "Food" });

            expect(response.status).toBe(500);
        });
    });

    describe("PATCH /api/categories/:id", () => {
        it("updates an owned category", async () => {
            prismaMock.category.findFirst.mockResolvedValue({
                id: CATEGORY_ID,
            });

            const response = await request(app)
                .patch(`/api/categories/${CATEGORY_ID}`)
                .set(authenticatedRequest())
                .send({ name: "Updated Food", color: "#ff0000" });

            expect(response.status).toBe(200);
            expect(prismaMock.category.findFirst).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: CATEGORY_ID, userId: USER_ID },
                }),
            );
            expect(prismaMock.category.update).toHaveBeenCalledWith({
                where: { id: CATEGORY_ID },
                data: { name: "Updated Food", color: "#ff0000" },
            });
        });

        it("rejects an empty update", async () => {
            const response = await request(app)
            .patch(`/api/categories/${CATEGORY_ID}`)
            .set(authenticatedRequest())
            .send({});

          expect(response.status).toBe(400);
            expect(prismaMock.category.update).not.toHaveBeenCalled();
        });

        it("rejects an empty name", async () => {
            const response = await request(app)
                .patch(`/api/categories/${CATEGORY_ID}`)
                .set(authenticatedRequest())
                .send({ name: " " });

            expect(response.status).toBe(400);
        });

        it("rejects an invalid color", async () => {
            const response = await request(app)
                .patch(`/api/categories/${CATEGORY_ID}`)
                .set(authenticatedRequest())
                .send({ color: "blue" });

            expect(response.status).toBe(400);
        });

        it("does not update a category owned by another user", async () => {
            prismaMock.category.findFirst.mockResolvedValue(null);

            const response = await request(app)
                .patch(`/api/categories/${CATEGORY_ID}`)
                .set(authenticatedRequest( createToken(OTHER_USER_ID) ))
                .send({ name: "Hijacked" });

            expect(response.status).toBe(404);
            expect(prismaMock.category.update).not.toHaveBeenCalled();
        });

        it("returns 409 for a duplicate category name", async () => {
            prismaMock.category.findFirst.mockResolvedValue({ id: CATEGORY_ID });
            prismaMock.category.update.mockRejectedValue({ code: "P2002" });

            const response = await request(app)
                .patch(`/api/categories/${CATEGORY_ID}`)
                .set(authenticatedRequest())
                .send({ name: "Food" });

            expect(response.status).toBe(409);
        });
    });

    describe("DELETE /api/categories/:id", () => {
        it("deletes an owned category", async () => {
            prismaMock.category.findFirst.mockResolvedValue({
                id: CATEGORY_ID,
            });

            const response = await request(app)
                .delete(`/api/categories/${CATEGORY_ID}`)
                .set(authenticatedRequest());

            expect(response.status).toBe(200);
            expect(prismaMock.category.delete).toHaveBeenCalledWith({
                where: { id: CATEGORY_ID },
            });
        });

        it("does not delete a category owned by another user", async () => {
            prismaMock.category.findFirst.mockResolvedValue(null);

            const response = await request(app)
                .delete(`/api/categories/${CATEGORY_ID}`)
                .set(authenticatedRequest( createToken(OTHER_USER_ID) ));

            expect(response.status).toBe(404);
            expect(prismaMock.category.delete).not.toHaveBeenCalled();
        });

        it("returns 500 when deletion fails", async () => {
            prismaMock.category.findFirst.mockResolvedValue({ id: CATEGORY_ID });
            prismaMock.category.delete.mockRejectedValue(
                new Error("Database error"),
            );

            const response = await request(app)
                .delete(`/api/categories/${CATEGORY_ID}`)
                .set(authenticatedRequest());

            expect(response.status).toBe(500);
        });
    });
});
