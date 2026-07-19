import express, { type Express, type RequestHandler } from "express";
import cors from "cors";
import pinoHttpImport from "pino-http";
import type { IncomingMessage, ServerResponse } from "http";

import router from "./routes";
import { logger } from "./lib/logger";

const pinoHttp = pinoHttpImport as unknown as (opts?: {
  logger?: typeof logger;
  serializers?: {
    req?: (req: IncomingMessage & { id?: string | number }) => unknown;
    res?: (res: ServerResponse) => unknown;
  };
}) => RequestHandler;

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;