import { z } from "zod";

export const successResponseSchema = z.object({ success: z.literal(true) });

export const urlResponseSchema = z.object({ url: z.string() });

export const readableRowsOf = <Row>(row: z.ZodType<Row, z.ZodTypeDef, unknown>) =>
  z.array(z.unknown()).transform((rows) =>
    rows.flatMap((entry) => {
      const parsed = row.safeParse(entry);
      return parsed.success ? [parsed.data] : [];
    }),
  );
