import * as v from "valibot";

export const feedbackRequestSchema = v.object({
  decodeId: v.pipe(v.string(), v.uuid("decodeId must be a valid UUID")),
  thumbsUp: v.boolean("thumbsUp must be a boolean"),
});
