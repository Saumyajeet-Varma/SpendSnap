-- CreateTable
CREATE TABLE "TokenRevocation" (
    "jti" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenRevocation_pkey" PRIMARY KEY ("jti")
);

-- CreateIndex
CREATE INDEX "TokenRevocation_expiresAt_idx" ON "TokenRevocation"("expiresAt");
