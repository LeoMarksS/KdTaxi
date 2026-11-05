ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_price_check" CHECK ("pricing_rules"."price" >= 0);--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_price_check" CHECK ("rides"."price" is null or "rides"."price" >= 0);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_rating_check" CHECK ("users"."rating" >= 0 and "users"."rating" <= 5);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_ride_count_check" CHECK ("users"."ride_count" >= 0);