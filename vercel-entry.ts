/**
 * Vercel serverless function entry point
 * Wraps the Hono API app for Vercel's runtime
 *
 * This file gets bundled by scripts/build-vercel.ts into api/index.js
 * Vercel picks that up as a serverless function at /api/*
 */
import { handle } from "hono/vercel";
import app from "./packages/api/src/index";

export default handle(app);
