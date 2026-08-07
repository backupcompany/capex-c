import { redirect } from 'next/navigation';

/** Legacy `/login` — canonical entry is `/`. */
export default function LegacyLoginRedirectPage() {
  redirect('/');
}
