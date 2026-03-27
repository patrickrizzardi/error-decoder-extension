import type { ErrorHandler } from "hono";
import { errorCodes } from "@shared/types";

export const errorHandler: ErrorHandler = (err, c) => {
  console.error(`[API Error] ${err.message}`);

  return c.json(
    {
      error: {
        message: "Internal server error",
        code: errorCodes.serverError,
      },
    },
    500
  );
};
