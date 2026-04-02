import * as v from "valibot";

export const checkoutRequestSchema = v.object({
  interval: v.picklist(["month", "year"], "interval must be 'month' or 'year'"),
});
