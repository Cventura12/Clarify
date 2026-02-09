-- CreateEnum
CREATE TYPE "DelegationStatus" AS ENUM ('PENDING', 'APPROVED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('IDLE', 'INTERPRETING', 'INTERPRETED', 'PLANNING', 'PLANNED', 'AWAITING_AUTHORITY', 'AUTHORIZED', 'DONE', 'BLOCKED', 'DEFERRED', 'ERROR');

-- CreateEnum
CREATE TYPE "StepActionType" AS ENUM ('USER_ONLY', 'DRAFT_EMAIL', 'CREATE_GMAIL_DRAFT');

-- CreateEnum
CREATE TYPE "ExecutionRunStatus" AS ENUM ('STARTED', 'SUCCEEDED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "ExecutionStepStatus" AS ENUM ('ATTEMPTED', 'SKIPPED', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "FailureReason" AS ENUM ('SCOPE_DENIED', 'NOT_APPROVED', 'SCHEMA_VALIDATION', 'GMAIL_AUTH', 'GMAIL_API', 'LLM_ERROR', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('CREATED', 'UPDATED', 'STATUS_CHANGED', 'DELEGATION_GRANTED', 'DELEGATION_REVOKED', 'CONTEXT_USED', 'EXECUTION_ATTEMPTED', 'EXECUTION_SUCCEEDED', 'EXECUTION_FAILED', 'EXECUTION_SKIPPED', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('DUE_DIGEST');

-- CreateTable
CREATE TABLE "Request" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,
    "rawInput" TEXT NOT NULL,
    "domain" TEXT NOT NULL DEFAULT 'OTHER',
    "urgency" TEXT NOT NULL DEFAULT 'MEDIUM',
    "complexity" TEXT NOT NULL DEFAULT 'MODERATE',
    "title" TEXT,
    "summary" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'IDLE',
    "interpretResult" TEXT,

    CONSTRAINT "Request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "totalSteps" INTEGER NOT NULL,
    "estimatedTotalEffort" TEXT,
    "deadline" TIMESTAMP(3),
    "planResult" TEXT,
    "requestId" TEXT NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Step" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sequence" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "actionType" "StepActionType" NOT NULL DEFAULT 'USER_ONLY',
    "effort" TEXT NOT NULL DEFAULT 'SHORT',
    "delegation" TEXT NOT NULL DEFAULT 'USER_ONLY',
    "suggestedDate" TIMESTAMP(3),
    "nextCheckAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dependencies" TEXT,
    "planId" TEXT NOT NULL,

    CONSTRAINT "Step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Outcome" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "result" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "output" TEXT,
    "stepId" TEXT NOT NULL,

    CONSTRAINT "Outcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Delegation" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "DelegationStatus" NOT NULL DEFAULT 'PENDING',
    "scope" JSONB NOT NULL,
    "approvedStepIds" JSONB NOT NULL,
    "userId" TEXT,
    "requestId" TEXT NOT NULL,
    "planId" TEXT,

    CONSTRAINT "Delegation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" "ActionType" NOT NULL,
    "message" TEXT,
    "payloadPreview" JSONB,
    "requestId" TEXT NOT NULL,
    "stepId" TEXT,
    "delegationId" TEXT,

    CONSTRAINT "ActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthAccount" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "scope" TEXT,
    "tokenType" TEXT,
    "expiresAt" TIMESTAMP(3),
    "email" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "requestId" TEXT NOT NULL,
    "delegationId" TEXT,
    "status" "ExecutionRunStatus" NOT NULL DEFAULT 'STARTED',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "summary" TEXT,
    "error" TEXT,

    CONSTRAINT "ExecutionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionRunStep" (
    "id" TEXT NOT NULL,
    "executionRunId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "status" "ExecutionStepStatus" NOT NULL,
    "reason" "FailureReason",
    "message" TEXT,

    CONSTRAINT "ExecutionRunStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateBucket" TEXT NOT NULL,
    "payloadPreview" JSONB,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "hasSeenFirstWin" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Plan_requestId_key" ON "Plan"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "Outcome_stepId_key" ON "Outcome"("stepId");

-- CreateIndex
CREATE INDEX "Delegation_userId_idx" ON "Delegation"("userId");

-- CreateIndex
CREATE INDEX "Delegation_requestId_idx" ON "Delegation"("requestId");

-- CreateIndex
CREATE INDEX "Delegation_planId_idx" ON "Delegation"("planId");

-- CreateIndex
CREATE INDEX "ActionLog_requestId_idx" ON "ActionLog"("requestId");

-- CreateIndex
CREATE INDEX "ActionLog_stepId_idx" ON "ActionLog"("stepId");

-- CreateIndex
CREATE INDEX "ActionLog_delegationId_idx" ON "ActionLog"("delegationId");

-- CreateIndex
CREATE INDEX "OAuthAccount_userId_idx" ON "OAuthAccount"("userId");

-- CreateIndex
CREATE INDEX "OAuthAccount_provider_idx" ON "OAuthAccount"("provider");

-- CreateIndex
CREATE INDEX "ExecutionRun_userId_idx" ON "ExecutionRun"("userId");

-- CreateIndex
CREATE INDEX "ExecutionRun_requestId_idx" ON "ExecutionRun"("requestId");

-- CreateIndex
CREATE INDEX "ExecutionRun_delegationId_idx" ON "ExecutionRun"("delegationId");

-- CreateIndex
CREATE INDEX "ExecutionRunStep_executionRunId_idx" ON "ExecutionRunStep"("executionRunId");

-- CreateIndex
CREATE INDEX "ExecutionRunStep_stepId_idx" ON "ExecutionRunStep"("stepId");

-- CreateIndex
CREATE INDEX "NotificationLog_userId_idx" ON "NotificationLog"("userId");

-- CreateIndex
CREATE INDEX "NotificationLog_dateBucket_idx" ON "NotificationLog"("dateBucket");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationLog_userId_type_dateBucket_key" ON "NotificationLog"("userId", "type", "dateBucket");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Step" ADD CONSTRAINT "Step_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outcome" ADD CONSTRAINT "Outcome_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "Step"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delegation" ADD CONSTRAINT "Delegation_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delegation" ADD CONSTRAINT "Delegation_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delegation" ADD CONSTRAINT "Delegation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionLog" ADD CONSTRAINT "ActionLog_delegationId_fkey" FOREIGN KEY ("delegationId") REFERENCES "Delegation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionLog" ADD CONSTRAINT "ActionLog_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionLog" ADD CONSTRAINT "ActionLog_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "Step"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthAccount" ADD CONSTRAINT "OAuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionRun" ADD CONSTRAINT "ExecutionRun_delegationId_fkey" FOREIGN KEY ("delegationId") REFERENCES "Delegation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionRun" ADD CONSTRAINT "ExecutionRun_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionRun" ADD CONSTRAINT "ExecutionRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionRunStep" ADD CONSTRAINT "ExecutionRunStep_executionRunId_fkey" FOREIGN KEY ("executionRunId") REFERENCES "ExecutionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionRunStep" ADD CONSTRAINT "ExecutionRunStep_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "Step"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
