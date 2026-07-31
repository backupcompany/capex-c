/**
 * Public auth routes — no App shell, no session bootstrap.
 * Login lives here; protected UI stays under `(main)/`.
 */
export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
