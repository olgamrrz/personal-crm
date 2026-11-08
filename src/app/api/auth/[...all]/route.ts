import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";

// The link from the email (/api/auth/magic-link/verify) and the renewal of the sign-in (/api/auth/get-session)
export const { GET, POST } = toNextJsHandler(auth);
