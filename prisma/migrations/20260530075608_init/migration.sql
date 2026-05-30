CREATE TABLE "cities" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "bounds_ne_lat" DOUBLE PRECISION,
    "bounds_ne_lng" DOUBLE PRECISION,
    "bounds_sw_lat" DOUBLE PRECISION,
    "bounds_sw_lng" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "neighbourhoods" (
    "id" TEXT NOT NULL,
    "city_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "geojson" JSONB,
    CONSTRAINT "neighbourhoods_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "listings" (
    "id" TEXT NOT NULL,
    "city_id" TEXT NOT NULL,
    "neighbourhood_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "property_type" TEXT NOT NULL,
    "room_type" TEXT NOT NULL,
    "accommodates" INTEGER NOT NULL DEFAULT 1,
    "bedrooms" INTEGER,
    "beds" INTEGER,
    "bathrooms" DOUBLE PRECISION,
    "price" DOUBLE PRECISION,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "host_id" TEXT,
    "host_name" TEXT,
    "rating_avg" DOUBLE PRECISION,
    "review_count" INTEGER NOT NULL DEFAULT 0,
    "review_summary" TEXT,
    "aspect_scores" JSONB,
    "price_percentile" DOUBLE PRECISION,
    "source_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "calendar_days" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "price" DOUBLE PRECISION,
    CONSTRAINT "calendar_days_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reviewer_id" TEXT,
    "reviewer_name" TEXT,
    "rating" DOUBLE PRECISION,
    "text" TEXT,
    "language" TEXT,
    "aspects" JSONB,
    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "listing_embeddings" (
    "listing_id" TEXT NOT NULL,
    "embedding" DOUBLE PRECISION[] NOT NULL,
    CONSTRAINT "listing_embeddings_pkey" PRIMARY KEY ("listing_id")
);

CREATE TABLE "review_embeddings" (
    "review_id" TEXT NOT NULL,
    "embedding" DOUBLE PRECISION[] NOT NULL,
    CONSTRAINT "review_embeddings_pkey" PRIMARY KEY ("review_id")
);

CREATE TABLE "wishlist_items" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_traces" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "token" TEXT,
    "steps" JSONB NOT NULL DEFAULT '[]',
    "tokens_used" INTEGER,
    "latency_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_traces_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cities_slug_key" ON "cities"("slug");
CREATE UNIQUE INDEX "neighbourhoods_city_id_slug_key" ON "neighbourhoods"("city_id", "slug");
CREATE INDEX "listings_city_id_price_idx" ON "listings"("city_id", "price");
CREATE INDEX "listings_city_id_rating_avg_idx" ON "listings"("city_id", "rating_avg" DESC);
CREATE INDEX "listings_latitude_longitude_idx" ON "listings"("latitude", "longitude");
CREATE INDEX "calendar_days_date_available_listing_id_idx" ON "calendar_days"("date", "available", "listing_id");
CREATE UNIQUE INDEX "calendar_days_listing_id_date_key" ON "calendar_days"("listing_id", "date");
CREATE INDEX "reviews_listing_id_date_idx" ON "reviews"("listing_id", "date" DESC);
CREATE INDEX "reviews_listing_id_rating_idx" ON "reviews"("listing_id", "rating");
CREATE INDEX "wishlist_items_token_idx" ON "wishlist_items"("token");
CREATE UNIQUE INDEX "wishlist_items_token_listing_id_key" ON "wishlist_items"("token", "listing_id");
CREATE UNIQUE INDEX "agent_traces_request_id_key" ON "agent_traces"("request_id");
CREATE INDEX "agent_traces_token_idx" ON "agent_traces"("token");

ALTER TABLE "neighbourhoods" ADD CONSTRAINT "neighbourhoods_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "listings" ADD CONSTRAINT "listings_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "listings" ADD CONSTRAINT "listings_neighbourhood_id_fkey" FOREIGN KEY ("neighbourhood_id") REFERENCES "neighbourhoods"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "calendar_days" ADD CONSTRAINT "calendar_days_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "listing_embeddings" ADD CONSTRAINT "listing_embeddings_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "review_embeddings" ADD CONSTRAINT "review_embeddings_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
