import * as v from "valibot";

export const feedbackRequestSchema = v.object({
  decodeId: v.pipe(v.string(), v.minLength(1, "decodeId is required")),
  thumbsUp: v.boolean("thumbsUp must be a boolean"),
});

export type ValidatedFeedbackRequest = v.InferInput<typeof feedbackRequestSchema>;
