import { NextResponse } from 'next/server';
import { signInSchema } from '@assessment/contracts';
import { getSupabaseAdmin, setSession } from '@/lib/auth';

export async function POST(request: Request) {
  const input = signInSchema.parse(await request.json());
  const { data, error } = await getSupabaseAdmin().auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });
  if (error || !data.session) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }
  const response = new NextResponse(null, { status: 204 });
  for (const cookie of setSession(data.session)) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }
  return response;
}
