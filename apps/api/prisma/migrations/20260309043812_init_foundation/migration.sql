-- CreateEnum
CREATE TYPE "CapabilityType" AS ENUM ('ABSTRACT', 'LEAF');

-- CreateEnum
CREATE TYPE "LifecycleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DEPRECATED', 'RETIRED');

-- CreateEnum
CREATE TYPE "ModelVersionState" AS ENUM ('DRAFT', 'PUBLISHED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "BranchType" AS ENUM ('MAIN', 'WHAT_IF');

-- CreateEnum
CREATE TYPE "ChangeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ChangeRequestType" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'REPARENT', 'MERGE', 'RETIRE');

-- CreateEnum
CREATE TYPE "MappingState" AS ENUM ('ACTIVE', 'INACTIVE', 'PENDING');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED', 'RETRYING');

-- CreateEnum
CREATE TYPE "HealthStatus" AS ENUM ('HEALTHY', 'DEGRADED', 'UNHEALTHY');

-- CreateTable
CREATE TABLE "Capability" (
    "id" UUID NOT NULL,
    "uniqueName" TEXT NOT NULL,
    "aliases" TEXT[],
    "description" TEXT,
    "domain" TEXT,
    "type" "CapabilityType" NOT NULL DEFAULT 'ABSTRACT',
    "parentId" UUID,
    "lifecycleStatus" "LifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "rationale" TEXT,
    "sourceReferences" TEXT[],
    "tags" TEXT[],
    "stewardId" TEXT,
    "stewardDepartment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Capability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapabilityVersion" (
    "id" UUID NOT NULL,
    "capabilityId" UUID NOT NULL,
    "modelVersionId" UUID NOT NULL,
    "changeType" TEXT NOT NULL,
    "changedFields" JSONB NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CapabilityVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelVersion" (
    "id" UUID NOT NULL,
    "versionLabel" TEXT NOT NULL,
    "state" "ModelVersionState" NOT NULL DEFAULT 'DRAFT',
    "baseVersionId" UUID,
    "branchType" "BranchType" NOT NULL DEFAULT 'MAIN',
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "publishedAt" TIMESTAMP(3),
    "rollbackOfVersionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeRequest" (
    "id" UUID NOT NULL,
    "type" "ChangeRequestType" NOT NULL,
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedBy" TEXT NOT NULL,
    "rationale" TEXT,
    "approvals" JSONB,
    "affectedCapabilityIds" UUID[],
    "impactSummary" TEXT,
    "downstreamPlan" TEXT,
    "executionLog" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mapping" (
    "id" UUID NOT NULL,
    "mappingType" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "capabilityId" UUID NOT NULL,
    "state" "MappingState" NOT NULL DEFAULT 'ACTIVE',
    "attributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DownstreamConsumer" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "contractType" TEXT NOT NULL,
    "syncMode" TEXT NOT NULL,
    "transformationProfile" TEXT,
    "healthStatus" "HealthStatus" NOT NULL DEFAULT 'HEALTHY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DownstreamConsumer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishEvent" (
    "id" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "modelVersionId" UUID NOT NULL,
    "entityId" UUID NOT NULL,
    "payloadRef" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveryStatus" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "PublishEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Capability_uniqueName_key" ON "Capability"("uniqueName");

-- CreateIndex
CREATE INDEX "Capability_parentId_idx" ON "Capability"("parentId");

-- CreateIndex
CREATE INDEX "Capability_lifecycleStatus_idx" ON "Capability"("lifecycleStatus");

-- CreateIndex
CREATE INDEX "Capability_domain_idx" ON "Capability"("domain");

-- CreateIndex
CREATE INDEX "CapabilityVersion_capabilityId_idx" ON "CapabilityVersion"("capabilityId");

-- CreateIndex
CREATE INDEX "CapabilityVersion_modelVersionId_idx" ON "CapabilityVersion"("modelVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "ModelVersion_versionLabel_key" ON "ModelVersion"("versionLabel");

-- CreateIndex
CREATE INDEX "Mapping_capabilityId_idx" ON "Mapping"("capabilityId");

-- CreateIndex
CREATE INDEX "Mapping_systemId_idx" ON "Mapping"("systemId");

-- CreateIndex
CREATE UNIQUE INDEX "DownstreamConsumer_name_key" ON "DownstreamConsumer"("name");

-- CreateIndex
CREATE INDEX "PublishEvent_modelVersionId_idx" ON "PublishEvent"("modelVersionId");

-- CreateIndex
CREATE INDEX "PublishEvent_entityId_idx" ON "PublishEvent"("entityId");

-- AddForeignKey
ALTER TABLE "Capability" ADD CONSTRAINT "Capability_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Capability"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapabilityVersion" ADD CONSTRAINT "CapabilityVersion_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "Capability"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapabilityVersion" ADD CONSTRAINT "CapabilityVersion_modelVersionId_fkey" FOREIGN KEY ("modelVersionId") REFERENCES "ModelVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelVersion" ADD CONSTRAINT "ModelVersion_baseVersionId_fkey" FOREIGN KEY ("baseVersionId") REFERENCES "ModelVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelVersion" ADD CONSTRAINT "ModelVersion_rollbackOfVersionId_fkey" FOREIGN KEY ("rollbackOfVersionId") REFERENCES "ModelVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mapping" ADD CONSTRAINT "Mapping_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "Capability"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishEvent" ADD CONSTRAINT "PublishEvent_modelVersionId_fkey" FOREIGN KEY ("modelVersionId") REFERENCES "ModelVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
