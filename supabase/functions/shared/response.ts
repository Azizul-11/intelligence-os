import type { ApiResponse } from "./types.ts";

export function success<T>(
  data: T,
  status = 200,
): Response {
  const body: ApiResponse<T> = {
    success: true,
    data,
  };

  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}

export function failure(
  code: string,
  message: string,
  status = 400,
): Response {
  const body: ApiResponse = {
    success: false,
    error: {
      code,
      message,
    },
  };

  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}