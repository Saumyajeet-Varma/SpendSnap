import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app.js";

describe("GET /api/health", () => {
    it("should return 200 and a healthy status", async () => {
        const response = await request(app).get("/api/health");

        expect(response.status).toBe(200)
        expect(response.body).toEqual({
            success: true,
            message: "Server is running",
            data: {
                service: "spendsnap-api",
                version: "0.1.0",
                status: "healthy",
            },
        });
    });
});