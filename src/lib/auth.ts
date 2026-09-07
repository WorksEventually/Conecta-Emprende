import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Response, Request } from "express";
import crypto from "crypto";

const BCRYPT_ROUNDS = 12;

export const COOKIES = {
  ACCESS_TOKEN: "access_token",
  REFRESH_TOKEN: "refresh_token",
  OAUTH_STATE: "oauth_state",
} as const;

export function setOAuthStateCookie(res: Response, state: string): void {
  res.cookie(COOKIES.OAUTH_STATE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 10 * 60 * 1000,
    path: "/",
  });
}

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

function getAccessTokenExpiry(): string {
  return process.env.ACCESS_TOKEN_EXPIRY || (process.env.NODE_ENV === "production" ? "1h" : "15m");
}

function getRefreshTokenExpiry(): string {
  return process.env.REFRESH_TOKEN_EXPIRY || "7d";
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateAccessToken(payload: TokenPayload): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET not configured");
  return jwt.sign(payload, secret, { expiresIn: getAccessTokenExpiry() as jwt.SignOptions["expiresIn"] });
}

export function generateRefreshToken(payload: TokenPayload): string {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) throw new Error("JWT_REFRESH_SECRET not configured");
  return jwt.sign(payload, secret, { expiresIn: getRefreshTokenExpiry() as jwt.SignOptions["expiresIn"] });
}

export function verifyAccessToken(token: string): TokenPayload | null {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET not configured");
    return jwt.verify(token, secret) as TokenPayload;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): TokenPayload | null {
  try {
    const secret = process.env.JWT_REFRESH_SECRET;
    if (!secret) throw new Error("JWT_REFRESH_SECRET not configured");
    return jwt.verify(token, secret) as TokenPayload;
  } catch {
    return null;
  }
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  const isProduction = process.env.NODE_ENV === "production";

  res.cookie(COOKIES.ACCESS_TOKEN, accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "strict" : "lax",
    maxAge: isProduction ? 60 * 60 * 1000 : 15 * 60 * 1000,
    path: "/",
  });

  res.cookie(COOKIES.REFRESH_TOKEN, refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "strict" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(COOKIES.ACCESS_TOKEN, { path: "/" });
  res.clearCookie(COOKIES.REFRESH_TOKEN, { path: "/" });
}

export function getRefreshTokenFromRequest(req: Request): string | undefined {
  return req.cookies?.[COOKIES.REFRESH_TOKEN];
}

export function getAccessTokenFromRequest(req: Request): string | undefined {
  return req.cookies?.[COOKIES.ACCESS_TOKEN];
}

export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function getRefreshTokenExpiryDate(): Date {
  const days = process.env.REFRESH_TOKEN_EXPIRY === "7d" ? 7 : 7;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
