-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guestId" TEXT NOT NULL,
    "username" TEXT,
    "passwordHash" TEXT,
    "nickname" TEXT NOT NULL,
    "avatar" TEXT,
    "beans" INTEGER NOT NULL DEFAULT 1000,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isBound" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GameRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "roomCode" TEXT NOT NULL,
    "roundNo" INTEGER NOT NULL,
    "dongs" INTEGER NOT NULL,
    "scoreChange" INTEGER NOT NULL,
    "isBanker" BOOLEAN NOT NULL,
    "isWinner" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GameRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BeanLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "memo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BeanLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_guestId_key" ON "User"("guestId");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_guestId_idx" ON "User"("guestId");

-- CreateIndex
CREATE INDEX "GameRecord_userId_idx" ON "GameRecord"("userId");

-- CreateIndex
CREATE INDEX "GameRecord_roomCode_idx" ON "GameRecord"("roomCode");

-- CreateIndex
CREATE INDEX "BeanLog_userId_idx" ON "BeanLog"("userId");
