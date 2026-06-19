import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

/**
 * Returns the Clerk session JWT for use as a Bearer token in API calls.
 * Redirects to /sign-in if no session exists (safety net for server components).
 */
export async function getAuthToken(): Promise<string> {
  const { getToken } = auth();
  const token = await getToken();
  if (!token) redirect("/sign-in");
  return token;
}

/**
 * Returns Authorization headers for server-side fetch calls to the FastAPI backend.
 */
export async function authHeaders(): Promise<HeadersInit> {
  const token = await getAuthToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}
