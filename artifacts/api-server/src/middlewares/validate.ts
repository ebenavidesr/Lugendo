import { z } from "zod/v4";
import { Request, Response, NextFunction } from "express";

export function validate(schema: z.ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const flat = result.error.flatten();
      res.status(400).json({
        error: "Validation failed",
        errors: flat.fieldErrors,
      });
      return;
    }
    req.body = result.data;
    next();
  };
}
