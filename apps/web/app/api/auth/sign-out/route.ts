import { NextResponse } from 'next/server';
import { clearSession } from '@/lib/auth';

export async function POST() {
  const response = new NextResponse(null, { status: 204 });
  for (const cookie of clearSession()) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }
  return response;
}
