-- CreateTable
CREATE TABLE "seller_photos" (
    "seller_id" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_photos_pkey" PRIMARY KEY ("seller_id")
);

-- AddForeignKey
ALTER TABLE "seller_photos" ADD CONSTRAINT "seller_photos_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
