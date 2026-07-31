import { cookies } from "next/headers";
import { readHasSessionCookies } from "@/lib/auth/authCookies.server";
import { MainShellClient } from "./MainShellClient";

/**
 * Shell yang tetap hidup saat navigasi antar path. `App` tidak boleh di `page.tsx`
 * karena setiap ganti URL akan unmount/remount page → state `currentUser` hilang
 * dan layar login muncul lagi.
 */
export default async function MainShellLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const hasSessionCookies = readHasSessionCookies(await cookies());

  return (
    <MainShellClient hasSessionCookies={hasSessionCookies}>
      {children}
    </MainShellClient>
  );
}
