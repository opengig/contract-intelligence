/*
  Warnings:

  - You are about to drop the column `columns` on the `Contract` table. All the data in the column will be lost.
  - You are about to drop the column `fileType` on the `Contract` table. All the data in the column will be lost.
  - You are about to drop the `ContractRow` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `type` to the `Contract` table without a default value. This is not possible if the table is not empty.
  - Added the required column `vendorId` to the `Contract` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "ContractRow" DROP CONSTRAINT "ContractRow_contractId_fkey";

-- AlterTable
ALTER TABLE "Contract" DROP COLUMN "columns",
DROP COLUMN "fileType",
ADD COLUMN     "processingJobId" TEXT,
ADD COLUMN     "storageKey" TEXT,
ADD COLUMN     "summary" TEXT,
ADD COLUMN     "summaryEmbedding" vector(1536),
ADD COLUMN     "type" TEXT NOT NULL,
ADD COLUMN     "vendorId" TEXT NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'uploaded';

-- DropTable
DROP TABLE "ContractRow";

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractTerm" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "termType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "route" TEXT,
    "vehicleType" TEXT,
    "rate" DOUBLE PRECISION,
    "unit" TEXT,
    "formula" TEXT,
    "conditions" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractTable" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "headers" JSONB NOT NULL,
    "rows" JSONB NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractMetadata" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "carrierName" TEXT,
    "carrierScac" TEXT,
    "mode" TEXT,
    "shipper" TEXT,
    "startDate" TIMESTAMP(3),
    "expirationDate" TIMESTAMP(3),
    "currency" TEXT,
    "divisions" JSONB,
    "originRegions" JSONB,
    "destRegions" JSONB,
    "rateType" TEXT,
    "laneCount" INTEGER,
    "keyTerms" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "invoiceNo" TEXT,
    "filePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "chargeType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "invoicedAmount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditResult" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "invoiceTotal" DOUBLE PRECISION NOT NULL,
    "expectedTotal" DOUBLE PRECISION NOT NULL,
    "variance" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLineResult" (
    "id" TEXT NOT NULL,
    "auditResultId" TEXT NOT NULL,
    "invoiceLineId" TEXT NOT NULL,
    "chargeType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "invoicedAmount" DOUBLE PRECISION NOT NULL,
    "expectedAmount" DOUBLE PRECISION NOT NULL,
    "variance" DOUBLE PRECISION NOT NULL,
    "result" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "matchedTermId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditLineResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractTerm_contractId_idx" ON "ContractTerm"("contractId");

-- CreateIndex
CREATE INDEX "ContractTable_contractId_idx" ON "ContractTable"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractMetadata_contractId_key" ON "ContractMetadata"("contractId");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditResult_invoiceId_key" ON "AuditResult"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditLineResult_invoiceLineId_key" ON "AuditLineResult"("invoiceLineId");

-- CreateIndex
CREATE INDEX "AuditLineResult_auditResultId_idx" ON "AuditLineResult"("auditResultId");

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractTerm" ADD CONSTRAINT "ContractTerm_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractTable" ADD CONSTRAINT "ContractTable_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractMetadata" ADD CONSTRAINT "ContractMetadata_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditResult" ADD CONSTRAINT "AuditResult_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLineResult" ADD CONSTRAINT "AuditLineResult_auditResultId_fkey" FOREIGN KEY ("auditResultId") REFERENCES "AuditResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLineResult" ADD CONSTRAINT "AuditLineResult_invoiceLineId_fkey" FOREIGN KEY ("invoiceLineId") REFERENCES "InvoiceLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
