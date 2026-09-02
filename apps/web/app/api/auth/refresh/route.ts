import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, setSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get('assessment_refresh')?.value;
  if (!refreshToken) return NextResponse.json({ error: 'No refresh session' }, { status: 401 });
  const { data, error } = await getSupabaseAdmin().auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) return NextResponse.json({ error: 'Session expired' }, { status: 401 });
  const response = new NextResponse(null, { status: 204 });
  for (const cookie of setSession(data.session)) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }
  return response;
}
