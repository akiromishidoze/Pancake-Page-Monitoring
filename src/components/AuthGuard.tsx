import { cookies } from 'next/headers';
import { validateSession } from '@/lib/auth';
import { redirect } from 'next/navigation';

export async function AuthGuard({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const session = cookieStore.get('session')?.value;

  if (!(await validateSession(session))) {
    redirect('/login');
  }

  return <>{children}</>;
}
