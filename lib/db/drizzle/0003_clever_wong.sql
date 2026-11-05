ALTER TABLE "pricing_rules" RENAME COLUMN "price" TO "car_price";--> statement-breakpoint
ALTER TABLE "pricing_rules" ALTER COLUMN "car_price" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pricing_rules" DROP CONSTRAINT "pricing_rules_price_check";--> statement-breakpoint
ALTER TABLE "pricing_rules" ADD COLUMN "motorcycle_price" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_car_price_check" CHECK ("pricing_rules"."car_price" is null or "pricing_rules"."car_price" >= 0);--> statement-breakpoint
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_motorcycle_price_check" CHECK ("pricing_rules"."motorcycle_price" is null or "pricing_rules"."motorcycle_price" >= 0);